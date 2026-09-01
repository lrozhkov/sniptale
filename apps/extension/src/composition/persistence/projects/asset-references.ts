import type { VideoProject } from '../../../features/video/project/types';
import type { VideoProjectEntry } from './contracts';
import { createProjectAssetMediaId } from '../../../features/media-hub/media-id';
import { parseDbEntries } from '../infrastructure/indexed-db/read-primitives';
import { parseVideoProjectEntry } from './read-guards';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import type { PhysicalDeleteAssetOperation } from '../assets';
import { PROJECT_ASSET_OWNER_KIND, PROJECT_MEDIA_ASSET_ROLE } from './asset-publication';
import { parseProjectAssetEntry } from './read-guards';
import {
  createLibraryLifecycle,
  promoteLibraryLifecycle,
  type LibraryLifecycle,
} from '../library-lifecycle/contracts';

type ProjectAssetDeleteStore = {
  delete(key: string): Promise<unknown>;
  get(key: string): Promise<unknown>;
};

type ProjectAssetOwnerStore = {
  delete(key: [string, string, string]): Promise<unknown>;
  index(name: 'assetId'): { count(assetId: string): Promise<number> };
};

type ProjectAssetRefStore = { delete(key: string): Promise<unknown> };

type ProjectAssetReferenceProjectStore = {
  getAll(): Promise<unknown[]>;
};

type ProjectAssetMediaStore = ProjectAssetDeleteStore & {
  get(key: string): Promise<unknown>;
  put(value: unknown): Promise<unknown>;
};

export async function deletePublishedProjectEntry(args: {
  countAssetOwners(assetId: string): Promise<number>;
  deleteAssetEntry(): Promise<unknown>;
  deleteAssetOwner(): Promise<unknown>;
  deleteAssetRef(assetId: string): Promise<unknown>;
  deleteMediaEntry(): Promise<unknown>;
  entry: { assetId: string } | null;
  operation: PhysicalDeleteAssetOperation;
  recordOperation(): Promise<unknown>;
}): Promise<void> {
  await args.deleteAssetEntry();
  await args.deleteMediaEntry();
  if (!args.entry) return;
  await args.deleteAssetOwner();
  if ((await args.countAssetOwners(args.entry.assetId)) !== 0) return;
  await args.deleteAssetRef(args.entry.assetId);
  args.operation.assetIds.push(args.entry.assetId);
  await args.recordOperation();
}

export function collectProjectOwnedAssetIds(project: VideoProject | undefined): string[] {
  if (!project) {
    return [];
  }

  return project.assets.flatMap((asset) =>
    asset.source.kind === 'project-asset' ? [asset.source.projectAssetId] : []
  );
}

function collectAssetIdsReferencedByOtherProjects(
  entries: VideoProjectEntry[],
  ownerProjectId: string,
  candidateAssetIds: Set<string>
): Set<string> {
  const referencedAssetIds = new Set<string>();

  for (const entry of entries) {
    if (entry.id === ownerProjectId) {
      continue;
    }

    for (const assetId of collectProjectOwnedAssetIds(entry.project)) {
      if (candidateAssetIds.has(assetId)) {
        referencedAssetIds.add(assetId);
      }
    }
  }

  return referencedAssetIds;
}

async function deleteUnreferencedProjectAssets(
  projectAssetStore: ProjectAssetDeleteStore,
  mediaLibraryStore: ProjectAssetMediaStore,
  projectAssetIds: string[],
  referencedAssetIds: ReadonlySet<string>,
  assetOwnerStore: ProjectAssetOwnerStore,
  assetRefStore: ProjectAssetRefStore,
  operation: PhysicalDeleteAssetOperation
): Promise<string[]> {
  const deletedAssetIds: string[] = [];

  for (const projectAssetId of projectAssetIds) {
    if (referencedAssetIds.has(projectAssetId)) {
      continue;
    }

    const mediaId = createProjectAssetMediaId(projectAssetId);
    const media = parseMediaLibraryEntry(await mediaLibraryStore.get(mediaId));
    if (media && media.lifecycle?.storageClass !== 'temporary') {
      continue;
    }

    const projectAsset = parseProjectAssetEntry(await projectAssetStore.get(projectAssetId));
    await projectAssetStore.delete(projectAssetId);
    await mediaLibraryStore.delete(mediaId);
    if (projectAsset) {
      await assetOwnerStore.delete([
        PROJECT_ASSET_OWNER_KIND,
        projectAssetId,
        PROJECT_MEDIA_ASSET_ROLE,
      ]);
      if ((await assetOwnerStore.index('assetId').count(projectAsset.assetId)) === 0) {
        await assetRefStore.delete(projectAsset.assetId);
        operation.assetIds.push(projectAsset.assetId);
      }
    }
    deletedAssetIds.push(projectAssetId);
  }

  return deletedAssetIds;
}

export async function deleteProjectAssetsUnreferencedByOtherProjects(args: {
  assetOwnerStore: ProjectAssetOwnerStore;
  assetRefStore: ProjectAssetRefStore;
  mediaLibraryStore: ProjectAssetMediaStore;
  operation: PhysicalDeleteAssetOperation;
  ownerProjectId: string;
  projectAssetIds: string[];
  projectAssetStore: ProjectAssetDeleteStore;
  projectStore: ProjectAssetReferenceProjectStore;
}): Promise<string[]> {
  const referencedAssetIds =
    args.projectAssetIds.length > 0
      ? collectAssetIdsReferencedByOtherProjects(
          parseDbEntries(await args.projectStore.getAll(), parseVideoProjectEntry),
          args.ownerProjectId,
          new Set(args.projectAssetIds)
        )
      : new Set<string>();

  return deleteUnreferencedProjectAssets(
    args.projectAssetStore,
    args.mediaLibraryStore,
    args.projectAssetIds,
    referencedAssetIds,
    args.assetOwnerStore,
    args.assetRefStore,
    args.operation
  );
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
      : createLibraryLifecycle('temporary', args.now);
    await args.mediaLibraryStore.put({ ...media, lifecycle });
  }
}
