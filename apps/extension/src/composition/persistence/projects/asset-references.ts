import { MEDIA_LIBRARY_STORE } from '../infrastructure/indexed-db/core';
import { releaseUnpublishedProjectAssets } from '../media-library/delete-cascade.sources';
import type { VideoProject } from '../../../features/video/project/types';
import { createProjectAssetMediaId } from '../../../features/media-hub/media-id';
import { parseDbEntries } from '../infrastructure/indexed-db/read-primitives';
import { parseVideoProjectEntry } from './read-guards';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import type { PhysicalDeleteAssetOperation } from '../assets';
import {
  createLibraryLifecycle,
  promoteLibraryLifecycle,
  type LibraryLifecycle,
} from '../library-lifecycle/contracts';

type ProjectAssetDeleteStore = {
  delete(key: string): Promise<unknown>;
  get(key: string): Promise<unknown>;
};

type ProjectAssetReferenceProjectStore = {
  getAll(): Promise<unknown[]>;
};

type ProjectAssetMediaStore = ProjectAssetDeleteStore & {
  get(key: string): Promise<unknown>;
  put(value: unknown): Promise<unknown>;
};

export function collectProjectOwnedAssetIds(project: VideoProject | undefined): string[] {
  if (!project) {
    return [];
  }

  return project.assets.flatMap((asset) =>
    asset.source.kind === 'project-asset' ? [asset.source.projectAssetId] : []
  );
}

export async function deleteProjectAssetsUnreferencedByOtherProjects(args: {
  tx: Parameters<typeof releaseUnpublishedProjectAssets>[0];
  operation: PhysicalDeleteAssetOperation;
  projectAssetIds: string[];
}): Promise<string[]> {
  for (const projectAssetId of args.projectAssetIds) {
    const mediaId = createProjectAssetMediaId(projectAssetId);
    const store = args.tx.objectStore(MEDIA_LIBRARY_STORE);
    const media = parseMediaLibraryEntry(await store.get(mediaId));
    if (media?.id === mediaId && media.lifecycle?.storageClass === 'temporary') {
      // Retain historical independently published mirrors when their project is detached.
      await store.put!({
        ...media,
        lifecycle: promoteLibraryLifecycle(media.lifecycle, Date.now()),
      });
    }
  }
  return releaseUnpublishedProjectAssets(args.tx, new Set(args.projectAssetIds), args.operation);
}

export async function syncProjectAssetMirrorLifecycles(args: {
  lifecycle: LibraryLifecycle;
  mediaLibraryStore: ProjectAssetMediaStore;
  now: number;
  ownerProjectId: string;
  projectAssetIds: ReadonlySet<string>;
  projectStore: ProjectAssetReferenceProjectStore;
}): Promise<void> {
  const libraryAssetIds = new Set<string>();
  for (const otherProject of parseDbEntries(
    await args.projectStore.getAll(),
    parseVideoProjectEntry
  )) {
    if (
      otherProject.id === args.ownerProjectId ||
      otherProject.lifecycle?.storageClass === 'temporary'
    ) {
      continue;
    }
    for (const projectAssetId of collectProjectOwnedAssetIds(otherProject.project)) {
      libraryAssetIds.add(projectAssetId);
    }
  }

  for (const projectAssetId of args.projectAssetIds) {
    const media = parseMediaLibraryEntry(
      await args.mediaLibraryStore.get(createProjectAssetMediaId(projectAssetId))
    );
    if (!media) continue;
    const belongsToLibrary =
      media.lifecycle?.storageClass === 'library' ||
      args.lifecycle.storageClass === 'library' ||
      libraryAssetIds.has(projectAssetId);
    const lifecycle = belongsToLibrary
      ? promoteLibraryLifecycle(
          media.lifecycle ?? createLibraryLifecycle('library', media.updatedAt),
          args.now
        )
      : { ...media.lifecycle, ...createLibraryLifecycle('temporary', args.now) };
    await args.mediaLibraryStore.put({ ...media, lifecycle });
  }
}
