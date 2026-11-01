import { runWithLibraryTrashMutation } from './trash';
import { runWithDurableAssetLifecycleLock } from '../infrastructure/mutation-barrier';
import { recoverScenarioAssetPublications } from '../scenario/aggregate-mutations';
import { recoverMediaSourcePublications } from '../media-library/delete-cascade.recovery';
import { readAllWorkspaceStorage } from '../review-workspaces/storage';
import { createMaintenanceLog } from './maintenance-log';
import {
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
} from '../infrastructure/indexed-db/core.stores';
import {
  IMAGE_WORKSPACES_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  SCENARIO_ASSETS_STORE,
  STORE_NAME,
  VIDEO_PROJECTS_STORE,
} from '../infrastructure/indexed-db/core';
import type { IndexedDbWriteTransaction } from '../infrastructure/indexed-db/core';
import type { MediaLibraryEntry } from '../media-library/contracts';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { listMediaLibrary } from '../media-library';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { listVideoProjectEntries } from '../projects';
import { parseRecordingEntry } from '../recordings/index.guards';
import type { LocalStoragePolicy } from '../../../contracts/settings';
import { createProjectAssetMediaId } from '../../../features/media-hub/media-id';
import { getDraftRetentionMs } from './policy';
import { collectVideoProjectReferences } from './references';
import {
  mediaDependencyTarget,
  scenarioChildIsUnrelated,
  parseVideoDependencyEnvelope,
  videoSourceReferences,
  reviewReferencesForMedia,
} from '../media-library/dependencies';
import { parseVideoWorkspace } from '../review-workspaces/parser';
import { collectReviewAssetReferences } from '../review-workspaces/asset-refs';
import { repairLinkedRecordingLifecycles } from './project-recordings';
import { repairTemporaryProjectLifecycles } from './project-retention';
import { recoverRecordingAssetPublications } from '../recordings/asset-publication';
import { recoverProjectMediaPublications } from '../projects/asset-publication';
import { recoverImageWorkspacePublications } from '../image-aggregates/mutations';

const maintenanceLog = createMaintenanceLog();
const EXPIRY_BATCH_SIZE = 64;

interface ExpiryCandidate {
  id: string;
  retention: number | null;
}

export interface DraftCleanupResult {
  movedCount: number;
  movedIds: string[];
  retainedCount: number;
}

/** Committed moves survive a later failure; callers must not report complete success. */
export class DraftCleanupError extends Error {
  constructor(
    readonly result: DraftCleanupResult,
    cause: unknown
  ) {
    super('Draft cleanup stopped before completion', { cause });
    this.name = 'DraftCleanupError';
  }
}

function isExpired(updatedAt: number, retentionMs: number | null, now: number): boolean {
  return retentionMs !== null && updatedAt <= now - retentionMs;
}

export async function cleanupDrafts(args: {
  policy: LocalStoragePolicy;
  includeUnexpired?: boolean;
  signal?: AbortSignal;
  now?: number;
}): Promise<DraftCleanupResult> {
  const empty = { movedCount: 0, movedIds: [], retainedCount: 0 };
  if (args.signal?.aborted) return empty;
  await recoverRecordingAssetPublications();
  if (args.signal?.aborted) return empty;
  await recoverProjectMediaPublications();
  if (args.signal?.aborted) return empty;
  await recoverImageWorkspacePublications();
  if (args.signal?.aborted) return empty;
  await recoverScenarioAssetPublications();
  if (args.signal?.aborted) return empty;
  const now = args.now ?? Date.now();
  await repairTemporaryProjectLifecycles(now);
  if (args.signal?.aborted) return empty;
  await repairLinkedRecordingLifecycles(now);
  if (args.signal?.aborted || (!args.includeUnexpired && !args.policy.cleanupEnabled)) return empty;
  const ordinaryRetention = getDraftRetentionMs(args.policy, 'ordinary');
  const videoRetention = getDraftRetentionMs(args.policy, 'video');
  const [media, videoProjects] = await Promise.all([listMediaLibrary(), listVideoProjectEntries()]);
  const movedIds: string[] = [];
  let retainedCount = 0;
  const result = (): DraftCleanupResult => ({
    movedCount: movedIds.length,
    movedIds: [...movedIds],
    retainedCount,
  });
  const referencedMediaIds = new Set<string>();
  const referencedRecordingIds = new Set<string>();
  for (const project of videoProjects) {
    const refs = collectVideoProjectReferences(project);
    for (const id of refs.recordingIds) referencedRecordingIds.add(id);
    for (const id of refs.projectAssetIds) referencedMediaIds.add(createProjectAssetMediaId(id));
    for (const id of refs.libraryMediaIds) referencedMediaIds.add(id);
  }

  const includeUnexpired = Boolean(args.includeUnexpired);
  const candidates: ExpiryCandidate[] = [];
  const flushCandidates = async () => {
    if (!candidates.length || args.signal?.aborted) return;
    const batch = candidates.splice(0);
    const committed = await runWithLibraryTrashMutation(() =>
      runWithDurableAssetLifecycleLock(() =>
        moveExpiredMediaBatchToTrash(
          batch,
          () => args.now ?? Date.now(),
          includeUnexpired,
          args.signal
        )
      )
    );
    movedIds.push(...committed.movedIds);
    retainedCount += committed.retainedCount;
  };
  for (const [index, entry] of media.entries()) {
    if (args.signal && index % 32 === 0)
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (args.signal?.aborted) break;
    const lifecycle = entry.lifecycle;
    if (!lifecycle || lifecycle.trashedAt !== undefined || lifecycle.storageClass !== 'temporary')
      continue;
    const retention = entry.source.kind === 'recording' ? videoRetention : ordinaryRetention;
    if (!includeUnexpired && !isExpired(lifecycle.updatedAt, retention, now)) continue;
    if (
      referencedMediaIds.has(entry.id) ||
      (entry.source.kind === 'recording' && referencedRecordingIds.has(entry.source.recordingId))
    ) {
      retainedCount++;
      continue;
    }
    try {
      if (entry.source.kind === 'web-snapshot') await recoverMediaSourcePublications(entry);
      if (args.signal?.aborted) break;
      candidates.push({ id: entry.id, retention });
      if (candidates.length === EXPIRY_BATCH_SIZE) await flushCandidates();
    } catch (cause) {
      throw new DraftCleanupError(result(), cause);
    }
  }

  try {
    await flushCandidates();
  } catch (cause) {
    throw new DraftCleanupError(result(), cause);
  }
  return result();
}

/** Reuse evidence only inside one transaction that prevents reference writers from committing. */
function createExpiryRetentionReader(tx: IndexedDbWriteTransaction) {
  let projectAssets: unknown[] | undefined;
  let children: unknown[] | undefined;
  let videos: Awaited<ReturnType<typeof readExpiryVideoReferences>> | undefined;
  let workspaces: Awaited<ReturnType<typeof readExpiryWorkspaceReferences>> | undefined;
  return async (current: MediaLibraryEntry): Promise<boolean> => {
    if ((await tx.objectStore(IMAGE_WORKSPACES_STORE).get(current.id)) !== undefined) return true;
    projectAssets ??= await tx.objectStore(PROJECT_ASSETS_STORE).getAll();
    const target = mediaDependencyTarget(current, projectAssets);
    if (target.privateProjectAssetIds?.size) return true;
    children ??= await tx.objectStore(SCENARIO_ASSETS_STORE).getAll();
    if (children.some((raw) => !scenarioChildIsUnrelated(raw, target))) return true;
    videos ??= await readExpiryVideoReferences(tx);
    if (
      videos.unknownReferences ||
      videos.libraryIds.has(current.id) ||
      (current.source.kind === 'recording' &&
        videos.recordingIds.has(current.source.recordingId)) ||
      (current.source.kind === 'project-asset' &&
        videos.projectAssetIds.has(current.source.projectAssetId))
    )
      return true;
    workspaces ??= await readExpiryWorkspaceReferences(tx);
    const workspaceReferences = workspaces.references;
    return (
      workspaces.unknownReferences ||
      workspaces.primaryMediaIds.has(current.id) ||
      [...reviewReferencesForMedia(target)].some((ref) => workspaceReferences.has(ref))
    );
  };
}

async function readExpiryVideoReferences(tx: IndexedDbWriteTransaction) {
  const refs = {
    unknownReferences: false,
    libraryIds: new Set<string>(),
    recordingIds: new Set<string>(),
    projectAssetIds: new Set<string>(),
  };
  for (const raw of await tx.objectStore(VIDEO_PROJECTS_STORE).getAll()) {
    const envelope = parseVideoDependencyEnvelope(raw);
    if (!envelope) {
      refs.unknownReferences = true;
      break;
    }
    if (envelope.baseRecordingId !== null) refs.recordingIds.add(envelope.baseRecordingId);
    if (envelope.source.kind === 'recording') refs.recordingIds.add(envelope.source.recordingId);
    for (const source of envelope.sources) {
      for (const ref of videoSourceReferences(source)) {
        if (ref.kind === 'library-asset') refs.libraryIds.add(ref.id);
        else if (ref.kind === 'recording') refs.recordingIds.add(ref.id);
        else if (ref.kind === 'project-asset') refs.projectAssetIds.add(ref.id);
      }
    }
  }
  return refs;
}

async function readExpiryWorkspaceReferences(tx: IndexedDbWriteTransaction) {
  const refs = {
    unknownReferences: false,
    primaryMediaIds: new Set<string>(),
    references: new Set<string>(),
  };
  for (const raw of await readAllWorkspaceStorage(tx)) {
    const workspace = parseVideoWorkspace(raw);
    if (!workspace) {
      refs.unknownReferences = true;
      break;
    }
    refs.primaryMediaIds.add(workspace.aggregateId);
    refs.primaryMediaIds.add(workspace.sourceMediaId ?? workspace.aggregateId);
    for (const ref of collectReviewAssetReferences(workspace)) refs.references.add(ref);
  }
  return refs;
}

async function moveExpiredMediaBatchToTrash(
  candidates: readonly ExpiryCandidate[],
  clock: () => number,
  includeUnexpired: boolean,
  signal?: AbortSignal
): Promise<Pick<DraftCleanupResult, 'movedIds' | 'retainedCount'>> {
  return runWithIndexedDbMutation(async (db) => {
    if (signal?.aborted) return { movedIds: [], retainedCount: 0 };
    const tx = db.transaction(
      [
        MEDIA_LIBRARY_STORE,
        VIDEO_WORKSPACES_STORE,
        VIDEO_WORKSPACE_HISTORY_STORE,
        IMAGE_WORKSPACES_STORE,
        STORE_NAME,
        VIDEO_PROJECTS_STORE,
        PROJECT_ASSETS_STORE,
        SCENARIO_ASSETS_STORE,
      ],
      'readwrite'
    );
    const hasRetainedProject = createExpiryRetentionReader(tx);
    const committed: Pick<DraftCleanupResult, 'movedIds' | 'retainedCount'> = {
      movedIds: [],
      retainedCount: 0,
    };
    try {
      for (const candidate of candidates) {
        if (signal?.aborted) break;
        const outcome = await moveExpiredMediaToTrash(
          tx,
          candidate,
          clock,
          includeUnexpired,
          hasRetainedProject,
          signal
        );
        if (outcome === 'moved') committed.movedIds.push(candidate.id);
        else if (outcome === 'retained') committed.retainedCount++;
      }
      await tx.done;
      if (committed.retainedCount)
        void maintenanceLog.append({
          operation: 'drafts',
          code: 'in-use',
          counts: { retained: committed.retainedCount },
        });
      return committed;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* The transaction may already be closed. */
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  });
}

async function moveExpiredMediaToTrash(
  tx: IndexedDbWriteTransaction,
  candidate: ExpiryCandidate,
  clock: () => number,
  includeUnexpired: boolean,
  hasRetainedProject: (current: MediaLibraryEntry) => Promise<boolean>,
  signal?: AbortSignal
): Promise<'moved' | 'retained' | 'skipped'> {
  const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
  const current = parseMediaLibraryEntry(await mediaStore.get(candidate.id));
  if (
    !current ||
    current.lifecycle?.storageClass !== 'temporary' ||
    current.lifecycle.trashedAt !== undefined ||
    (!includeUnexpired && !isExpired(current.lifecycle.updatedAt, candidate.retention, clock()))
  )
    return 'skipped';
  if (await hasRetainedProject(current)) return 'retained';
  const recording =
    current.source.kind === 'recording'
      ? parseRecordingEntry(await tx.objectStore(STORE_NAME).get(current.source.recordingId))
      : null;
  if (
    recording &&
    (recording.lifecycle?.storageClass !== 'temporary' ||
      (!includeUnexpired &&
        !isExpired(recording.lifecycle.updatedAt, candidate.retention, clock())))
  )
    return 'retained';
  if (signal?.aborted) return 'skipped';
  await mediaStore.put({ ...current, lifecycle: { ...current.lifecycle, trashedAt: clock() } });
  return 'moved';
}
