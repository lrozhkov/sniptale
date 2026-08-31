import type { VideoProject } from '../../../features/video/project/types';
import {
  ASSET_OPERATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  initDB,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  VIDEO_PROJECTS_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { createProjectMutationStores } from './mutation-stores';
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
  discardPreparedAsset,
  parseAssetRef,
  publishReadyJournalWithRetry,
  readAssetFile,
  releaseAssetReadyProtection,
  writeBlobToAsset,
} from '../assets';
import {
  PROJECT_ASSET_OWNER_KIND,
  PROJECT_ASSET_PUBLICATION_DOMAIN,
  PROJECT_MEDIA_ASSET_ROLE,
  publishProjectAssetJournal,
  recoverProjectMediaPublications,
  type ProjectAssetPublicationPayload,
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
import { createLibraryLifecycle, updateLibraryLifecycle } from '../library-lifecycle/contracts';

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
    const {
      assetOperationStore,
      assetOwnerStore,
      assetRefStore,
      mediaLibraryStore,
      projectAssetStore,
      projectStore,
      tx,
    } = createProjectMutationStores(db);
    const existing = parseVideoProjectEntry(await projectStore.get(project.id));
    const guardedSave = guardStaleVideoProjectSave({
      existing: existing ?? undefined,
      options,
      project: candidate,
    });
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
      lifecycle: existing
        ? updateLibraryLifecycle(
            existing.lifecycle ?? createLibraryLifecycle('library', existing.updatedAt),
            now
          )
        : createLibraryLifecycle(options.storageClass ?? 'library', now),
      workspaceRevision: (existing?.workspaceRevision ?? 0) + 1,
    };

    await projectStore.put(entry);
    await syncProjectAssetMirrorLifecycles({
      lifecycle: entry.lifecycle!,
      mediaLibraryStore,
      now,
      ownerProjectId: project.id,
      projectAssetIds: nextProjectAssetIds,
      projectStore,
    });
    await deleteProjectAssetsUnreferencedByOtherProjects({
      assetOwnerStore,
      assetRefStore,
      mediaLibraryStore,
      operation: physicalDelete,
      ownerProjectId: project.id,
      projectAssetIds: removedProjectAssetIds,
      projectAssetStore,
      projectStore,
    });
    if (physicalDelete.assetIds.length > 0) await assetOperationStore.put(physicalDelete);
    await tx.done;
    publishMediaHubLibraryChanged(existing ? 'update' : 'create', [
      `video-project:${candidate.id}`,
    ]);
    return entry;
  });
  if (physicalDelete.assetIds.length > 0) await completePhysicalDeleteOperation(physicalDelete);
  return saved;
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

export async function saveProjectAsset(
  id: string,
  blob: Blob,
  mimeType: string,
  filename = id
): Promise<void> {
  await recoverProjectMediaPublications();
  await assertAssetWriteAdmission(blob.size);
  const prepared = await writeBlobToAsset(blob, { mimeType });
  const entry: StoredProjectAssetEntry = {
    assetId: prepared.ref.assetId,
    id,
    mimeType: prepared.ref.mimeType,
    createdAt: Date.now(),
    size: prepared.ref.size,
  };
  let journalCreated = false;
  try {
    const payload: ProjectAssetPublicationPayload = { entry, filename };
    const journal = await createAssetPublicationJournal({
      assetRefs: [prepared.ref],
      domain: PROJECT_ASSET_PUBLICATION_DOMAIN,
      payload,
    });
    journalCreated = true;
    await publishReadyJournalWithRetry(journal, publishProjectAssetJournal);
    await releaseAssetReadyProtection([prepared.ref.assetId]);
  } catch (error) {
    if (!journalCreated) await discardPreparedAsset(prepared.ref.assetId);
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
  const physicalDelete = buildPhysicalDeleteOperation([]);
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        PROJECT_ASSETS_STORE,
        MEDIA_LIBRARY_STORE,
        ASSET_OWNERS_STORE,
        ASSET_REFS_STORE,
        ASSET_OPERATIONS_STORE,
      ],
      'readwrite'
    );
    const entry = parseProjectAssetEntry(await tx.objectStore(PROJECT_ASSETS_STORE).get(id));
    await tx.objectStore(PROJECT_ASSETS_STORE).delete(id);
    await tx.objectStore(MEDIA_LIBRARY_STORE).delete(createProjectAssetMediaId(id));
    if (entry) {
      const ownerStore = tx.objectStore(ASSET_OWNERS_STORE);
      await ownerStore.delete([PROJECT_ASSET_OWNER_KIND, id, PROJECT_MEDIA_ASSET_ROLE]);
      if ((await ownerStore.index('assetId').count(entry.assetId)) === 0) {
        await tx.objectStore(ASSET_REFS_STORE).delete(entry.assetId);
        physicalDelete.assetIds.push(entry.assetId);
        await tx.objectStore(ASSET_OPERATIONS_STORE).put(physicalDelete);
      }
    }
    await tx.done;
  });
  if (physicalDelete.assetIds.length > 0) await completePhysicalDeleteOperation(physicalDelete);
}
