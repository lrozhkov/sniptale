import { assertNewProjectSources } from './new-reference-admission';
import type { VideoProject } from '../../../features/video/project/types';
import {
  ASSET_REFS_STORE,
  initDB,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  VIDEO_PROJECTS_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { deleteMediaAssetWithProjectCascade } from '../media-library/delete-cascade';
import { MediaAssetDeletionBlockedError } from '../media-library/deletion-errors';
import {
  mediaHasPendingPublication,
  releaseUnpublishedProjectAssets,
} from '../media-library/delete-cascade.sources';
import { createProjectDeletionStores, createProjectMutationStores } from './mutation-stores';
import { collectVideoProjectReferences } from '../library-lifecycle/references';
import { promoteLinkedRecordingLifecycles } from '../library-lifecycle/project-recordings';
import { createProjectAssetMediaId } from '../../../features/media-hub/media-id';
import {
  collectProjectOwnedAssetIds,
  deleteProjectAssetsUnreferencedByOtherProjects,
  syncProjectAssetMirrorLifecycles,
} from './asset-references';
import {
  type ProjectAssetReadResult,
  type StoredProjectAssetEntry,
  type VideoProjectEntry,
  type VideoProjectReadResult,
} from './contracts';
import {
  assertAssetWriteAdmission,
  buildPhysicalDeleteOperation,
  completePhysicalDeleteOperation,
  createAssetPublicationJournal,
  cancelAssetPublication,
  discardPreparedAsset,
  parseAssetRef,
  publishReadyJournalWithRetry,
  readAssetFile,
  releaseAssetReadyProtection,
  writeBlobToAsset,
  type AssetReadyJournal,
  listReadyJournals,
  type AssetRef,
} from '../assets';
import {
  PROJECT_ASSET_PUBLICATION_DOMAIN,
  publishProjectAssetJournal,
  recoverProjectMediaPublications,
  type ProjectAssetPublicationPayload,
  type ProjectAssetPublicationOptions,
} from './asset-publication';
import {
  createInvalidVideoProjectListItem,
  createVideoProjectListItem,
  createUnsupportedVideoProjectListItem,
  type VideoProjectListItem,
} from '../../../features/media-hub/video-project-list-items';
import { publishMediaHubLibraryChanged } from '../../../features/media-hub/events';
import { guardStaleVideoProjectSave, type SaveVideoProjectOptions } from './index.save-guard.ts';
import { parseDbEntries } from '../infrastructure/indexed-db/read-primitives';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import {
  parseProjectAssetEntry,
  parseVideoProjectEntry,
  parseVideoProjectEntryResult,
} from './read-guards';
import { isHydratableVideoProject } from '../../../features/video/project/validation';
import { verifyVideoProjectEffectSnapshotIntegrity } from '../../../features/video/project/effect-instance';
import {
  createLibraryLifecycle,
  promoteLibraryLifecycle,
  updateLibraryLifecycle,
} from '../library-lifecycle/contracts';

export { deleteVideoProject } from './index.delete.ts';
export * from './index.exports.ts';
export { InvalidVideoProjectError, UnsupportedEngine1VideoProjectError } from './contracts';

export async function saveVideoProject(
  project: VideoProject,
  options: SaveVideoProjectOptions = {}
): Promise<VideoProjectEntry> {
  const candidate = await prepareVideoProjectSave(project);
  const physicalDelete = buildPhysicalDeleteOperation([]);
  const saved = await runWithIndexedDbMutation(async (db) => {
    const stores = createProjectMutationStores(db);
    const { assetOperationStore, mediaLibraryStore, projectStore, recordingStore, tx } = stores;
    try {
      const existing = parseVideoProjectEntry(await projectStore.get(project.id));
      const guardedSave = guardStaleVideoProjectSave({
        existing: existing ?? undefined,
        options,
        project: candidate,
      });
      await assertNewProjectSources(guardedSave.project, existing?.project, stores);
      const existingProjectAssetIds = collectProjectOwnedAssetIds(existing?.project);
      const nextProjectAssetIds = new Set(collectProjectOwnedAssetIds(guardedSave.project));
      const removedProjectAssetIds = guardedSave.preservePersistedAssets
        ? []
        : existingProjectAssetIds.filter(
            (projectAssetId) => !nextProjectAssetIds.has(projectAssetId)
          );
      const now = Date.now();
      const entry: VideoProjectEntry = {
        id: candidate.id,
        project: {
          ...guardedSave.project,
          updatedAt: now,
        },
        createdAt: existing?.createdAt ?? candidate.createdAt,
        updatedAt: now,
        lifecycle: buildSavedProjectLifecycle(existing, now),
        workspaceRevision: (existing?.workspaceRevision ?? 0) + 1,
      };

      await persistProjectReferences({
        entry,
        mediaLibraryStore,
        now,
        projectAssetIds: nextProjectAssetIds,
        projectStore,
        recordingStore,
      });
      await deleteProjectAssetsUnreferencedByOtherProjects({
        tx,
        operation: physicalDelete,
        projectAssetIds: removedProjectAssetIds,
      });
      if (physicalDelete.assetIds.length > 0) await assetOperationStore.put(physicalDelete);
      await tx.done;
      publishMediaHubLibraryChanged(existing ? 'update' : 'create', [
        `video-project:${candidate.id}`,
      ]);
      return entry;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Transaction may already be closed. */
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  });
  if (physicalDelete.assetIds.length > 0) await completePhysicalDeleteOperation(physicalDelete);
  return saved;
}

async function persistProjectReferences(args: {
  entry: VideoProjectEntry;
  mediaLibraryStore: ReturnType<typeof createProjectMutationStores>['mediaLibraryStore'];
  now: number;
  projectAssetIds: ReadonlySet<string>;
  projectStore: ReturnType<typeof createProjectMutationStores>['projectStore'];
  recordingStore: ReturnType<typeof createProjectMutationStores>['recordingStore'];
}): Promise<void> {
  await args.projectStore.put(args.entry);
  await promoteLinkedRecordingLifecycles({
    mediaStore: args.mediaLibraryStore,
    now: args.now,
    recordingIds: collectVideoProjectReferences(args.entry).recordingIds,
    recordingStore: args.recordingStore,
  });
  await syncProjectAssetMirrorLifecycles({
    lifecycle: args.entry.lifecycle!,
    mediaLibraryStore: args.mediaLibraryStore,
    now: args.now,
    ownerProjectId: args.entry.id,
    projectAssetIds: args.projectAssetIds,
    projectStore: args.projectStore,
  });
}

function buildSavedProjectLifecycle(existing: VideoProjectEntry | null, now: number) {
  const lifecycle = existing
    ? (existing.lifecycle ?? createLibraryLifecycle('library', existing.updatedAt))
    : createLibraryLifecycle('library', now);
  return updateLibraryLifecycle(promoteLibraryLifecycle(lifecycle, now), now);
}

async function prepareVideoProjectSave(project: VideoProject): Promise<VideoProject> {
  const candidate = withVideoProjectCreatedAt(project);
  if (!isHydratableVideoProject(candidate)) throw new Error('Invalid video project payload');
  await verifyVideoProjectEffectSnapshotIntegrity(candidate);
  await recoverProjectMediaPublications();
  return candidate;
}

function withVideoProjectCreatedAt(project: VideoProject): VideoProject {
  return typeof project.createdAt === 'number' ? project : { ...project, createdAt: Date.now() };
}

export async function getVideoProject(id: string): Promise<VideoProjectReadResult> {
  const db = await initDB();
  const result = parseVideoProjectEntryResult(await db.get(VIDEO_PROJECTS_STORE, id));
  if (result.status !== 'ready') return result;
  try {
    await verifyVideoProjectEffectSnapshotIntegrity(result.entry.project);
    return {
      ...(result.entry.lifecycle ? { lifecycle: result.entry.lifecycle } : {}),
      project: result.entry.project,
      status: 'ready',
      workspaceRevision: result.entry.workspaceRevision ?? 0,
    };
  } catch {
    return {
      diagnostics: ['invalid-video-project-entry'],
      opaqueId: result.entry.id,
      status: 'invalid',
    };
  }
}

export async function listVideoProjects(): Promise<VideoProjectListItem[]> {
  const verified = await listVideoProjectReadResults();
  return verified
    .flatMap((result, index) =>
      result.status === 'ready'
        ? [createVideoProjectListItem(result.project, result.lifecycle, result.workspaceRevision)]
        : result.status === 'unsupported'
          ? [createUnsupportedVideoProjectListItem(result.metadata)]
          : result.status === 'invalid'
            ? [createInvalidVideoProjectListItem(result.opaqueId ?? `invalid:${index}`)]
            : []
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listVideoProjectReadResults(): Promise<VideoProjectReadResult[]> {
  const db = await initDB();
  const all = (await db.getAll(VIDEO_PROJECTS_STORE)).map(parseVideoProjectEntryResult);
  const verified: VideoProjectReadResult[] = [];
  for (const result of all) {
    if (result.status !== 'ready') {
      verified.push(result);
      continue;
    }
    try {
      await verifyVideoProjectEffectSnapshotIntegrity(result.entry.project);
      verified.push({
        ...(result.entry.lifecycle ? { lifecycle: result.entry.lifecycle } : {}),
        project: result.entry.project,
        status: 'ready',
        workspaceRevision: result.entry.workspaceRevision ?? 0,
      });
    } catch {
      verified.push({
        diagnostics: ['invalid-video-project-entry'],
        opaqueId: result.entry.id,
        status: 'invalid',
      });
    }
  }
  return verified;
}

export async function listVideoProjectEntries(): Promise<VideoProjectEntry[]> {
  const db = await initDB();
  return (await db.getAll(VIDEO_PROJECTS_STORE))
    .map(parseVideoProjectEntry)
    .filter((entry): entry is VideoProjectEntry => entry !== null)
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export interface PreparedProjectAsset {
  id: string;
  ref: AssetRef;
  /** Makes staged bytes recoverable before another owner attaches their reference. */
  protect(): Promise<void>;
  /** Cancels a protected import only when its caller proved no durable reference exists. */
  cancel(): Promise<void>;
  /** Publishes source ownership and optional Library identity, then releases ready protection. */
  publish(): Promise<void>;
  /** Discards the staged object unless a publication journal already owns it. */
  discard(): Promise<void>;
}

/**
 * Stages one project asset under ready protection without publishing it: the
 * caller attaches a durable reference first and only then publishes or discards.
 */
export async function prepareProjectAsset(
  blob: Blob,
  mimeType: string,
  filename?: string,
  id?: string,
  createdAt = Date.now(),
  requiredReview?: ProjectAssetPublicationPayload['requiredReview'],
  options: ProjectAssetPublicationOptions = {}
): Promise<PreparedProjectAsset> {
  const entryId = id ?? crypto.randomUUID();
  await recoverProjectMediaPublications();
  const sourceDb = await initDB();
  const rawPrevious: unknown = await sourceDb.get(PROJECT_ASSETS_STORE, entryId);
  const previous = parseProjectAssetEntry(rawPrevious);
  if (rawPrevious !== undefined && (!previous || previous.id !== entryId))
    throw new Error('Invalid existing project asset.');
  const expectedAssetId = previous?.assetId ?? null;
  await assertAssetWriteAdmission(blob.size);
  const prepared = await writeBlobToAsset(blob, { mimeType });
  const entry: StoredProjectAssetEntry = {
    assetId: prepared.ref.assetId,
    id: entryId,
    mimeType: prepared.ref.mimeType,
    createdAt,
    size: prepared.ref.size,
    ...(options.publishToLibrary === false && options.originMediaId
      ? { originMediaId: options.originMediaId }
      : {}),
  };
  let journal: AssetReadyJournal<ProjectAssetPublicationPayload> | null = null;
  let complete = false;
  let inFlight: Promise<void> | null = null;
  const protect = async () => {
    journal ??= await createAssetPublicationJournal({
      assetRefs: [prepared.ref],
      domain: PROJECT_ASSET_PUBLICATION_DOMAIN,
      payload: {
        entry,
        expectedAssetId,
        filename: filename || entryId,
        ...(requiredReview ? { requiredReview } : {}),
        ...(options.publishToLibrary === false ? { publishToLibrary: false } : {}),
      },
    });
  };
  const publish = async () => {
    if (complete) return;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      await protect();
      if (!journal) throw new Error('Project asset publication journal is unavailable.');
      await publishReadyJournalWithRetry(journal, publishProjectAssetJournal);
      await releaseAssetReadyProtection([prepared.ref.assetId]);
      complete = true;
    })();
    try {
      await inFlight;
    } finally {
      inFlight = null;
    }
  };
  return {
    id: entryId,
    ref: prepared.ref,
    protect,
    cancel: async () => {
      if (complete) return;
      if (journal) await cancelAssetPublication(journal);
      else await discardPreparedAsset(prepared.ref.assetId);
    },
    publish,
    discard: async () => {
      if (journal) return;
      await discardPreparedAsset(prepared.ref.assetId);
    },
  };
}

export async function saveProjectAsset(
  id: string,
  blob: Blob,
  mimeType: string,
  filename = id,
  createdAt = Date.now(),
  options: ProjectAssetPublicationOptions = {}
): Promise<void> {
  const prepared = await prepareProjectAsset(
    blob,
    mimeType,
    filename,
    id,
    createdAt,
    undefined,
    options
  );
  try {
    await prepared.publish();
  } catch (error) {
    await prepared.discard();
    throw error;
  }
}

export async function getProjectAsset(id: string): Promise<ProjectAssetReadResult> {
  let db: Awaited<ReturnType<typeof initDB>>;
  let storedEntry: unknown;
  try {
    db = await initDB();
    storedEntry = await db.get(PROJECT_ASSETS_STORE, id);
  } catch {
    return { reason: 'asset-entry-unavailable', status: 'unavailable' };
  }
  if (storedEntry === undefined) return { status: 'not-found' };
  const entry = parseProjectAssetEntry(storedEntry);
  if (!entry) return { reason: 'invalid-asset-entry', status: 'invalid' };

  let storedRef: unknown;
  try {
    storedRef = await db.get(ASSET_REFS_STORE, entry.assetId);
  } catch {
    return { reason: 'asset-reference-unavailable', status: 'unavailable' };
  }
  const ref = parseAssetRef(storedRef);
  if (!ref) return { reason: 'invalid-asset-reference', status: 'invalid' };
  try {
    return { entry: { ...entry, file: await readAssetFile(ref, id) }, status: 'ready' };
  } catch {
    return { reason: 'asset-file-unavailable', status: 'unavailable' };
  }
}

export async function listProjectAssets(): Promise<
  Array<StoredProjectAssetEntry & { filename: string }>
> {
  const db = await initDB();
  const entries = parseDbEntries(await db.getAll(PROJECT_ASSETS_STORE), parseProjectAssetEntry);
  const mediaEntries = parseDbEntries(await db.getAll(MEDIA_LIBRARY_STORE), parseMediaLibraryEntry);
  const mediaMap = new Map(mediaEntries.map((entry) => [entry.id, entry]));

  return entries.map((entry) => ({
    assetId: entry.assetId,
    id: entry.id,
    mimeType: entry.mimeType,
    createdAt: entry.createdAt,
    size: entry.size,
    filename: mediaMap.get(createProjectAssetMediaId(entry.id))?.filename ?? entry.id,
  }));
}

export async function deleteProjectAsset(id: string): Promise<void> {
  await recoverProjectMediaPublications();
  const db = await initDB();
  const mediaId = createProjectAssetMediaId(id);
  const rawMedia: unknown = await db.get(MEDIA_LIBRARY_STORE, mediaId);
  if (rawMedia !== undefined) {
    const media = parseMediaLibraryEntry(rawMedia);
    if (
      !media ||
      media.id !== mediaId ||
      media.source.kind !== 'project-asset' ||
      media.source.projectAssetId !== id
    )
      throw new MediaAssetDeletionBlockedError('source-unavailable');
    if ((await listReadyJournals()).some((journal) => mediaHasPendingPublication(journal, media)))
      throw new MediaAssetDeletionBlockedError('pending-publication');
    await deleteMediaAssetWithProjectCascade(mediaId, []);
    return;
  }
  const physicalDelete = buildPhysicalDeleteOperation([]);
  await runWithIndexedDbMutation(async (database) => {
    const { tx, assetOperationStore } = createProjectDeletionStores(database);
    try {
      await releaseUnpublishedProjectAssets(tx, new Set([id]), physicalDelete);
      if (physicalDelete.assetIds.length > 0) await assetOperationStore.put(physicalDelete);
      await tx.done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Transaction may already be closed. */
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  });
  if (physicalDelete.assetIds.length > 0) await completePhysicalDeleteOperation(physicalDelete);
}

export type { ProjectAssetPublicationOptions };
