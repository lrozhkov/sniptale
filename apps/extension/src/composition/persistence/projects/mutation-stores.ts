import type { initDB } from '../infrastructure/indexed-db/core';
import {
  AGGREGATE_PRESENTATIONS_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  VIDEO_PROJECTS_STORE,
} from '../infrastructure/indexed-db/core';

type ProjectMutationDatabase = Awaited<ReturnType<typeof initDB>>;

export function createProjectMutationStores(db: ProjectMutationDatabase) {
  const tx = db.transaction(
    [VIDEO_PROJECTS_STORE, PROJECT_ASSETS_STORE, MEDIA_LIBRARY_STORE],
    'readwrite'
  );
  return {
    mediaLibraryStore: tx.objectStore(MEDIA_LIBRARY_STORE),
    projectAssetStore: tx.objectStore(PROJECT_ASSETS_STORE),
    projectStore: tx.objectStore(VIDEO_PROJECTS_STORE),
    tx,
  };
}

export function createProjectDeletionStores(db: ProjectMutationDatabase) {
  const tx = db.transaction(
    [
      VIDEO_PROJECTS_STORE,
      PROJECT_ASSETS_STORE,
      MEDIA_LIBRARY_STORE,
      AGGREGATE_PRESENTATIONS_STORE,
    ],
    'readwrite'
  );
  return {
    aggregatePresentationStore: tx.objectStore(AGGREGATE_PRESENTATIONS_STORE),
    mediaLibraryStore: tx.objectStore(MEDIA_LIBRARY_STORE),
    projectAssetStore: tx.objectStore(PROJECT_ASSETS_STORE),
    projectStore: tx.objectStore(VIDEO_PROJECTS_STORE),
    tx,
  };
}
