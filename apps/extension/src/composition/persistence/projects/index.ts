import type { VideoProject } from '../../../features/video/project/types';
import {
  initDB,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  VIDEO_PROJECTS_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { createProjectMutationStores } from './mutation-stores';
import { buildProjectAssetMediaEntry } from '../media-library/entry-mapping';
import { createProjectAssetMediaId } from '../../../features/media-hub/media-id';
import {
  collectProjectOwnedAssetIds,
  deleteProjectAssetsUnreferencedByOtherProjects,
} from './asset-references';
import {
  type ProjectAssetEntry,
  type VideoProjectEntry,
  type VideoProjectReadResult,
} from './contracts';
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

export { deleteVideoProject } from './index.delete.ts';
export * from './index.exports.ts';
export { InvalidVideoProjectError, UnsupportedEngine1VideoProjectError } from './contracts';

export async function saveVideoProject(
  project: VideoProject,
  options: SaveVideoProjectOptions = {}
): Promise<void> {
  const candidate = withVideoProjectCreatedAt(project);
  if (!isHydratableVideoProject(candidate)) {
    throw new Error('Invalid video project payload');
  }
  await verifyVideoProjectEffectSnapshotIntegrity(candidate);
  await runWithIndexedDbMutation(async (db) => {
    const { mediaLibraryStore, projectAssetStore, projectStore, tx } =
      createProjectMutationStores(db);
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
    };

    await projectStore.put(entry);
    await deleteProjectAssetsUnreferencedByOtherProjects({
      mediaLibraryStore,
      ownerProjectId: project.id,
      projectAssetIds: removedProjectAssetIds,
      projectAssetStore,
      projectStore,
    });
    await tx.done;
    publishMediaHubLibraryChanged(existing ? 'update' : 'create', [
      `video-project:${candidate.id}`,
    ]);
  });
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
    return { project: result.entry.project, status: 'ready' };
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
        ? [createVideoProjectListItem(result.project)]
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
      verified.push({ project: result.entry.project, status: 'ready' });
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

export async function saveProjectAsset(
  id: string,
  blob: Blob,
  mimeType: string,
  filename = id
): Promise<void> {
  const entry: ProjectAssetEntry = {
    id,
    blob,
    mimeType,
    createdAt: Date.now(),
    size: blob.size,
  };

  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction([PROJECT_ASSETS_STORE, MEDIA_LIBRARY_STORE], 'readwrite');
    await tx.objectStore(PROJECT_ASSETS_STORE).put(entry);
    await tx.objectStore(MEDIA_LIBRARY_STORE).put({
      ...buildProjectAssetMediaEntry(entry),
      filename,
      originalFilename: filename,
    });
    await tx.done;
  });
}

export async function getProjectAsset(id: string): Promise<ProjectAssetEntry | undefined> {
  const db = await initDB();
  const entry = parseProjectAssetEntry(await db.get(PROJECT_ASSETS_STORE, id));
  return entry ?? undefined;
}

export async function listProjectAssets(): Promise<
  Array<Omit<ProjectAssetEntry, 'blob'> & { filename: string }>
> {
  const db = await initDB();
  const entries = parseDbEntries(await db.getAll(PROJECT_ASSETS_STORE), parseProjectAssetEntry);
  const mediaEntries = parseDbEntries(await db.getAll(MEDIA_LIBRARY_STORE), parseMediaLibraryEntry);
  const mediaMap = new Map(mediaEntries.map((entry) => [entry.id, entry]));

  return entries.map((entry) => ({
    id: entry.id,
    mimeType: entry.mimeType,
    createdAt: entry.createdAt,
    size: entry.size,
    filename: mediaMap.get(createProjectAssetMediaId(entry.id))?.filename ?? entry.id,
  }));
}

export async function deleteProjectAsset(id: string): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction([PROJECT_ASSETS_STORE, MEDIA_LIBRARY_STORE], 'readwrite');
    await tx.objectStore(PROJECT_ASSETS_STORE).delete(id);
    await tx.objectStore(MEDIA_LIBRARY_STORE).delete(createProjectAssetMediaId(id));
    await tx.done;
  });
}
