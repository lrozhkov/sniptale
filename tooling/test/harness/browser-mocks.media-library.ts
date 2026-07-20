import {
  DIAGNOSTICS_EVENTS_STORE,
  DIAGNOSTICS_META_STORE,
  EDITOR_SESSIONS_STORE,
  initDB,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  STORE_NAME,
  THUMBNAILS_STORE,
  VIDEO_PROJECTS_STORE,
} from '../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core';
import type {
  MediaLibraryEntry,
  MediaThumbnailEntry,
} from '../../../apps/extension/src/composition/persistence/media-library/contracts';
import type { VideoProject } from '../../../apps/extension/src/features/video/project/types';

export type HarnessMediaLibraryAsset = {
  entry: MediaLibraryEntry;
  thumbnail?: MediaThumbnailEntry;
};

const HARNESS_MEDIA_LIBRARY_STORES = [
  STORE_NAME,
  DIAGNOSTICS_META_STORE,
  DIAGNOSTICS_EVENTS_STORE,
  VIDEO_PROJECTS_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  MEDIA_LIBRARY_STORE,
  THUMBNAILS_STORE,
  EDITOR_SESSIONS_STORE,
] as const;

export async function clearHarnessMediaLibrary(): Promise<void> {
  const db = await initDB();
  const transaction = db.transaction(HARNESS_MEDIA_LIBRARY_STORES, 'readwrite');

  await Promise.all(
    HARNESS_MEDIA_LIBRARY_STORES.map((storeName) => transaction.objectStore(storeName).clear())
  );
  await transaction.done;
}

export async function seedHarnessMediaLibrary(assets: HarnessMediaLibraryAsset[]): Promise<void> {
  if (assets.length === 0) {
    return;
  }

  const db = await initDB();
  const transaction = db.transaction([MEDIA_LIBRARY_STORE, THUMBNAILS_STORE], 'readwrite');

  await Promise.all(
    assets.flatMap(({ entry, thumbnail }) => {
      const operations: Promise<unknown>[] = [
        transaction.objectStore(MEDIA_LIBRARY_STORE).put(entry),
      ];

      if (thumbnail) {
        operations.push(transaction.objectStore(THUMBNAILS_STORE).put(thumbnail));
      }

      return operations;
    })
  );

  await transaction.done;
}

export async function seedHarnessVideoProjects(projects: VideoProject[]): Promise<void> {
  if (projects.length === 0) return;
  const db = await initDB();
  const transaction = db.transaction(VIDEO_PROJECTS_STORE, 'readwrite');
  const store = transaction.objectStore(VIDEO_PROJECTS_STORE);
  await Promise.all(
    projects.map((project) =>
      store.put({
        createdAt: project.createdAt,
        id: project.id,
        project,
        updatedAt: project.updatedAt,
      })
    )
  );
  await transaction.done;
}

export async function seedHarnessMediaState(state: {
  mediaLibrary?: HarnessMediaLibraryAsset[];
  videoProjects?: VideoProject[];
}): Promise<void> {
  if (state.mediaLibrary) await seedHarnessMediaLibrary(state.mediaLibrary);
  if (state.videoProjects) await seedHarnessVideoProjects(state.videoProjects);
}

export async function listHarnessMediaLibraryAssets(): Promise<MediaLibraryEntry[]> {
  const db = await initDB();
  return db.getAll(MEDIA_LIBRARY_STORE) as Promise<MediaLibraryEntry[]>;
}
