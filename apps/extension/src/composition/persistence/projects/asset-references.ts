import type { VideoProject } from '../../../features/video/project/types';
import type { VideoProjectEntry } from './contracts';
import { createProjectAssetMediaId } from '../../../features/media-hub/media-id';
import { parseDbEntries } from '../infrastructure/indexed-db/read-primitives';
import { parseVideoProjectEntry } from './read-guards';

type ProjectAssetDeleteStore = {
  delete(key: string): Promise<unknown>;
};

type ProjectAssetReferenceProjectStore = {
  getAll(): Promise<unknown[]>;
};

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
  mediaLibraryStore: ProjectAssetDeleteStore,
  projectAssetIds: string[],
  referencedAssetIds: ReadonlySet<string>
): Promise<string[]> {
  const deletedAssetIds: string[] = [];

  for (const projectAssetId of projectAssetIds) {
    if (referencedAssetIds.has(projectAssetId)) {
      continue;
    }

    await projectAssetStore.delete(projectAssetId);
    await mediaLibraryStore.delete(createProjectAssetMediaId(projectAssetId));
    deletedAssetIds.push(projectAssetId);
  }

  return deletedAssetIds;
}

export async function deleteProjectAssetsUnreferencedByOtherProjects(args: {
  mediaLibraryStore: ProjectAssetDeleteStore;
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
    referencedAssetIds
  );
}
