import { runWithLibraryTrashMutation } from './trash';
import { runWithDurableAssetLifecycleLock } from '../infrastructure/mutation-barrier';
import { recoverScenarioAssetPublications } from '../scenario/aggregate-mutations';
import { recoverMediaSourcePublications } from '../media-library/delete-cascade.recovery';
import { readAllWorkspaceStorage } from '../review-workspaces/storage';
import { createMaintenanceLog } from './maintenance-log';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
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
import type { initDB } from '../infrastructure/indexed-db/core';
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
  videoEntryIsUnrelated,
  reviewWorkspaceUsesMedia,
} from '../media-library/dependencies';
import { parseVideoWorkspace } from '../review-workspaces/parser';
import { repairLinkedRecordingLifecycles } from './project-recordings';
import { repairTemporaryProjectLifecycles } from './project-retention';
import { recoverRecordingAssetPublications } from '../recordings/asset-publication';
import { recoverProjectMediaPublications } from '../projects/asset-publication';
import { recoverImageWorkspacePublications } from '../image-aggregates/mutations';

const maintenanceLog = createMaintenanceLog();

export interface DraftCleanupResult {
  deletedCount: number;
  deletedIds: string[];
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
  const empty = { deletedCount: 0, deletedIds: [] };
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
  const deletedIds: string[] = [];
  const referencedMediaIds = new Set<string>();
  const referencedRecordingIds = new Set<string>();
  for (const project of videoProjects) {
    const refs = collectVideoProjectReferences(project);
    for (const id of refs.recordingIds) referencedRecordingIds.add(id);
    for (const id of refs.projectAssetIds) referencedMediaIds.add(createProjectAssetMediaId(id));
    for (const id of refs.libraryMediaIds) referencedMediaIds.add(id);
  }

  const includeUnexpired = Boolean(args.includeUnexpired);
  for (const [index, entry] of media.entries()) {
    if (args.signal && index % 32 === 0)
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (args.signal?.aborted) break;
    const lifecycle = entry.lifecycle;
    if (!lifecycle || lifecycle.trashedAt !== undefined || lifecycle.storageClass !== 'temporary')
      continue;
    if (referencedMediaIds.has(entry.id)) continue;
    if (entry.source.kind === 'recording' && referencedRecordingIds.has(entry.source.recordingId)) {
      continue;
    }
    const retention = entry.source.kind === 'recording' ? videoRetention : ordinaryRetention;
    if (!includeUnexpired && !isExpired(lifecycle.updatedAt, retention, now)) continue;
    if (entry.source.kind === 'web-snapshot') await recoverMediaSourcePublications(entry);
    if (args.signal?.aborted) break;
    if (
      await runWithLibraryTrashMutation(() =>
        runWithDurableAssetLifecycleLock(() =>
          moveExpiredMediaToTrash(
            entry.id,
            () => args.now ?? Date.now(),
            retention,
            includeUnexpired,
            args.signal
          )
        )
      )
    ) {
      deletedIds.push(entry.id);
    }
  }

  return { deletedCount: deletedIds.length, deletedIds };
}

type ExpiryTransaction = ReturnType<Awaited<ReturnType<typeof initDB>>['transaction']>;

/** Check authoritative retention evidence in the caller's fresh lifecycle transaction. */
async function hasRetainedProjectForExpiry(
  tx: ExpiryTransaction,
  current: MediaLibraryEntry
): Promise<boolean> {
  if ((await tx.objectStore(IMAGE_WORKSPACES_STORE).get(current.id)) !== undefined) return true;
  const target = mediaDependencyTarget(
    current,
    await tx.objectStore(PROJECT_ASSETS_STORE).getAll()
  );
  if (target.privateProjectAssetIds?.size) return true;
  const rawChildren = await tx.objectStore(SCENARIO_ASSETS_STORE).getAll();
  if (rawChildren.some((raw) => !scenarioChildIsUnrelated(raw, target))) return true;
  const videos = await tx.objectStore(VIDEO_PROJECTS_STORE).getAll();
  if (videos.some((raw) => !videoEntryIsUnrelated(raw, target, new Set()))) return true;
  return (await readAllWorkspaceStorage(tx)).some((raw) => {
    if (isRecord(raw) && raw['aggregateId'] === current.id) return true;
    const workspace = parseVideoWorkspace(raw);
    return !workspace || reviewWorkspaceUsesMedia(workspace, target);
  });
}

async function moveExpiredMediaToTrash(
  id: string,
  clock: () => number,
  retention: number | null,
  includeUnexpired: boolean,
  signal?: AbortSignal
): Promise<boolean> {
  if (signal?.aborted) return false;
  return runWithIndexedDbMutation(async (db) => {
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
    try {
      const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
      const current = parseMediaLibraryEntry(await mediaStore.get(id));
      if (
        !current ||
        current.lifecycle?.storageClass !== 'temporary' ||
        current.lifecycle.trashedAt !== undefined ||
        (!includeUnexpired && !isExpired(current.lifecycle.updatedAt, retention, clock()))
      ) {
        await tx.done;
        return false;
      }
      if (await hasRetainedProjectForExpiry(tx, current)) {
        await tx.done;
        void maintenanceLog.append({
          operation: 'drafts',
          code: 'in-use',
          counts: { retained: 1 },
        });
        return false;
      }
      const recordingStore = tx.objectStore(STORE_NAME);
      const recording =
        current.source.kind === 'recording'
          ? parseRecordingEntry(await recordingStore.get(current.source.recordingId))
          : null;
      if (
        recording &&
        (recording.lifecycle?.storageClass !== 'temporary' ||
          (!includeUnexpired && !isExpired(recording.lifecycle.updatedAt, retention, clock())))
      ) {
        await tx.done;
        return false;
      }

      if (signal?.aborted) {
        await tx.done;
        return false;
      }
      await mediaStore.put({
        ...current,
        lifecycle: { ...current.lifecycle, trashedAt: clock() },
      });
      await tx.done;
      return true;
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
