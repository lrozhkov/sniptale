import { publishLibraryProjectBindingInTransaction } from './known-library-source';
import { assertVideoWorkspaceUnchanged } from '../review-workspaces/store';
import { withVideoProjectUsage } from '../media-library/usage-index-keys';
import {
  parseProjectAssetSpeechClaim,
  parseProjectAssetAnnotationEffectClaim,
} from './asset-publication-payload';
import { retainReviewAttachmentLock } from './voiceover-publication-lock';
import { releaseAssetPublicationTransitions } from '../assets/opfs-store';
import { runWithDurableAssetLifecycleLock } from '../infrastructure/mutation-barrier';
import { isValidProjectAssetReviewResource } from './asset-publication-payload';
import { assertNewProjectSources, promoteProjectSourceLifecycles } from './new-reference-admission';
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
  const expectedReviewWorkspace = options.expectedReviewWorkspace
    ? structuredClone(options.expectedReviewWorkspace)
    : undefined;
  const libraryBindings = structuredClone(options.libraryBindings ?? []);
  const candidate = await prepareVideoProjectSave(project);
  const physicalDelete = buildPhysicalDeleteOperation([]);
  const saved = await runWithIndexedDbMutation(async (db) => {
    const stores = createProjectMutationStores(db);
    const { assetOperationStore, mediaLibraryStore, projectStore, recordingStore, tx } = stores;
    try {
      const existing = parseVideoProjectEntry(await projectStore.get(project.id));
      if (expectedReviewWorkspace) await assertVideoWorkspaceUnchanged(tx, expectedReviewWorkspace);
      const guardedSave = guardStaleVideoProjectSave({
        existing: existing ?? undefined,
        options,
        project: candidate,
      });
      for (const binding of libraryBindings) {
        if (
          existing ||
          !expectedReviewWorkspace ||
          binding.claim.mediaId !== expectedReviewWorkspace.aggregateId ||
          !guardedSave.project.assets.some(
            (asset) =>
              asset.source.kind === 'project-asset' &&
              asset.source.projectAssetId === binding.entry.id
          )
        )
          throw new Error('Invalid review destination source binding.');
        await publishLibraryProjectBindingInTransaction(tx, binding);
      }
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
      await promoteProjectSourceLifecycles(entry.project, stores, now);
      await deleteProjectAssetsUnreferencedByOtherProjects({
        tx,
        operation: physicalDelete,
        projectAssetIds: removedProjectAssetIds,
        deferForReaders: true,
      });
      if (physicalDelete.assetIds.length > 0 || physicalDelete.privateSources?.length)
        await assetOperationStore.put(physicalDelete);
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
  if (physicalDelete.assetIds.length > 0 || physicalDelete.privateSources?.length)
    await completePhysicalDeleteOperation(physicalDelete).catch(() => undefined);
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
  await args.projectStore.put(withVideoProjectUsage(args.entry));
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
  const db = await initDB();
  const entries = (await db.getAll(VIDEO_PROJECTS_STORE)).map(parseVideoProjectEntryResult);
  // Listing metadata must not read/hash every project's effect assets. Exact reads still verify them.
  return entries
    .flatMap((result, index) =>
      result.status === 'ready'
        ? [
            createVideoProjectListItem(
              result.entry.project,
              result.entry.lifecycle,
              result.entry.workspaceRevision
            ),
          ]
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

export { listVideoProjectEntries } from './queries';

export interface PreparedProjectAsset {
  id: string;
  ref: AssetRef;
  /** Makes staged bytes recoverable before another owner attaches their reference. */
  protect(): Promise<void>;
  /** Protects a private annotation buffer without holding the global erasure transition gate. */
  retainForSession(): Promise<() => Promise<void>>;
  /** Reads only this retained annotation's staged physical object, without publication. */
  readForSession?(signal: AbortSignal): Promise<Blob>;
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
  if (
    options.requiredReviewAnnotationEffect &&
    (!parseProjectAssetAnnotationEffectClaim(options.requiredReviewAnnotationEffect) ||
      options.publishToLibrary !== false ||
      !['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(mimeType) ||
      requiredReview !== undefined ||
      options.requiredReviewSpeech !== undefined ||
      options.requiredReviewResource !== undefined ||
      options.originMediaId !== undefined)
  )
    throw new Error('Invalid private annotation publication.');
  if (
    (options.requiredReviewResource?.slot !== 'watermark' &&
      options.requiredReviewResource?.acquisition === 'library-binding') ||
    !isValidProjectAssetReviewResource({
      mimeType,
      resource: options.requiredReviewResource,
      requiredReview,
      publishToLibrary: options.publishToLibrary,
    })
  )
    throw new Error('Invalid private review resource publication.');
  if (
    options.requiredReviewSpeech &&
    (!parseProjectAssetSpeechClaim(options.requiredReviewSpeech) ||
      options.publishToLibrary !== false ||
      !mimeType.startsWith('audio/') ||
      requiredReview !== undefined ||
      options.requiredReviewResource !== undefined ||
      options.originMediaId !== undefined)
  )
    throw new Error('Invalid private speech publication.');
  const entryId = id ?? crypto.randomUUID();
  await recoverProjectMediaPublications();
  const sourceDb = await initDB();
  const rawPrevious: unknown = await sourceDb.get(PROJECT_ASSETS_STORE, entryId);
  const previous = parseProjectAssetEntry(rawPrevious);
  if (rawPrevious !== undefined && (!previous || previous.id !== entryId))
    throw new Error('Invalid existing project asset.');
  const expectedAssetId = previous?.assetId ?? null;
  if (options.requiredReviewAnnotationEffect && expectedAssetId !== null)
    throw new Error('Private annotation publication requires a new immutable identity.');
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
  return createPreparedProjectAssetPublication(prepared.ref, {
    entry,
    expectedAssetId,
    filename: filename || entryId,
    ...(requiredReview ? { requiredReview } : {}),
    ...(options.requiredReviewSpeech ? { requiredReviewSpeech: options.requiredReviewSpeech } : {}),
    ...(options.requiredReviewAnnotationEffect
      ? { requiredReviewAnnotationEffect: options.requiredReviewAnnotationEffect }
      : {}),
    ...(options.requiredReviewResource
      ? { requiredReviewResource: options.requiredReviewResource }
      : {}),
    ...(options.publishToLibrary === false ? { publishToLibrary: false } : {}),
  });
}

/** Owns the staged asset's protection, publication retry and terminal cleanup state. */
function createPreparedProjectAssetPublication(
  ref: AssetRef,
  payload: ProjectAssetPublicationPayload
): PreparedProjectAsset {
  let journal: AssetReadyJournal<ProjectAssetPublicationPayload> | null = null;
  let complete = false;
  let inFlight: Promise<void> | null = null;
  let sessionLease: Promise<() => Promise<void>> | null = null;
  const protect = async () => {
    journal ??= await createAssetPublicationJournal({
      assetRefs: [ref],
      domain: PROJECT_ASSET_PUBLICATION_DOMAIN,
      payload,
    });
  };
  const publish = async () => {
    if (complete) return;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      await protect();
      if (!journal) throw new Error('Project asset publication journal is unavailable.');
      await publishReadyJournalWithRetry(journal, publishProjectAssetJournal);
      await releaseAssetReadyProtection([ref.assetId]);
      complete = true;
    })();
    try {
      await inFlight;
    } finally {
      inFlight = null;
    }
  };
  return {
    id: payload.entry.id,
    ref,
    protect,
    retainForSession: () => {
      if (!payload.requiredReviewAnnotationEffect)
        return Promise.reject(new Error('Session retention requires an annotation claim.'));
      if (complete) return Promise.resolve(async () => undefined);
      sessionLease ??= (async () => {
        const release = await retainReviewAttachmentLock(`project-asset:${payload.entry.id}`);
        try {
          await protect();
          await releaseAssetPublicationTransitions([ref.assetId]);
        } catch (error) {
          await release();
          throw error;
        }
        return async () => {
          await release();
          sessionLease = null;
        };
      })();
      void sessionLease.catch(() => {
        sessionLease = null;
      });
      return sessionLease;
    },
    readForSession: async (signal) => {
      signal.throwIfAborted();
      const retained = sessionLease;
      if (!payload.requiredReviewAnnotationEffect || complete || !retained)
        throw new Error('Annotation resource retention is unavailable.');
      await retained;
      signal.throwIfAborted();
      if (complete || sessionLease !== retained)
        throw new Error('Annotation resource retention is unavailable.');
      let blob: Blob;
      try {
        blob = await readAssetFile(ref, payload.entry.id);
      } catch {
        signal.throwIfAborted();
        throw new Error('Annotation resource bytes are unavailable.');
      }
      signal.throwIfAborted();
      if (complete || sessionLease !== retained)
        throw new Error('Annotation resource retention is unavailable.');
      return blob;
    },
    cancel: async () => {
      if (complete) return;
      if (journal && payload.requiredReviewAnnotationEffect) {
        await initDB();
        await runWithDurableAssetLifecycleLock(async (permit) => {
          // Erasure may have removed the ready journal while a paused editor still owns its lease.
          const retained = (await listReadyJournals()).find(
            (value) => value.journalId === journal?.journalId
          );
          if (retained) await cancelAssetPublication(retained, permit);
          else await releaseAssetReadyProtection([ref.assetId]);
        });
      } else if (journal) await cancelAssetPublication(journal);
      else await discardPreparedAsset(ref.assetId);
      complete = true;
    },
    publish,
    discard: async () => {
      if (journal) return;
      await discardPreparedAsset(ref.assetId);
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
