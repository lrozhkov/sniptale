import type { VideoProject } from '../../../features/video/project/types';
import type { VideoProjectEntry } from './contracts';
import type { LibraryStorageClass } from '../library-lifecycle/contracts';

export interface SaveVideoProjectOptions {
  baseUpdatedAt?: number | null;
  expectedWorkspaceRevision?: number | null;
  storageClass?: LibraryStorageClass;
}

class StaleVideoProjectSaveError extends Error {
  constructor(projectId: string) {
    super(`Video project ${projectId} was changed before this save completed`);
    this.name = 'StaleVideoProjectSaveError';
  }
}

function hasBaseRevisionConflict(args: {
  existing: VideoProjectEntry | undefined;
  options: SaveVideoProjectOptions;
  project: VideoProject;
}): boolean {
  if (args.options.expectedWorkspaceRevision !== undefined) {
    return args.existing
      ? args.options.expectedWorkspaceRevision !== (args.existing.workspaceRevision ?? 0)
      : args.options.expectedWorkspaceRevision !== null;
  }
  if (args.options.baseUpdatedAt === undefined) {
    return false;
  }

  if (!args.existing) {
    return args.options.baseUpdatedAt !== null;
  }

  return args.options.baseUpdatedAt !== args.existing.project.updatedAt;
}

function shouldPreservePersistedProjectAssets(args: {
  existing: VideoProjectEntry | undefined;
  options: SaveVideoProjectOptions;
  project: VideoProject;
}): boolean {
  if (!args.existing) {
    return false;
  }

  if (args.options.expectedWorkspaceRevision !== undefined) {
    return false;
  }

  if (
    args.options.baseUpdatedAt !== undefined &&
    args.options.baseUpdatedAt !== args.existing.project.updatedAt
  ) {
    return true;
  }

  return args.project.updatedAt < args.existing.project.updatedAt;
}

function mergePersistedProjectAssets(args: {
  existing: VideoProjectEntry | undefined;
  preservePersistedAssets: boolean;
  project: VideoProject;
}): VideoProject {
  if (!args.preservePersistedAssets || !args.existing) {
    return args.project;
  }

  const nextAssetIds = new Set(args.project.assets.map((asset) => asset.id));
  const persistedOnlyAssets = args.existing.project.assets.filter(
    (asset) => !nextAssetIds.has(asset.id)
  );
  return persistedOnlyAssets.length === 0
    ? args.project
    : { ...args.project, assets: [...args.project.assets, ...persistedOnlyAssets] };
}

export function guardStaleVideoProjectSave(args: {
  existing: VideoProjectEntry | undefined;
  options: SaveVideoProjectOptions;
  project: VideoProject;
}): { preservePersistedAssets: boolean; project: VideoProject } {
  if (hasBaseRevisionConflict(args)) {
    throw new StaleVideoProjectSaveError(args.project.id);
  }

  const preservePersistedAssets = shouldPreservePersistedProjectAssets(args);
  return {
    preservePersistedAssets,
    project: mergePersistedProjectAssets({
      existing: args.existing,
      preservePersistedAssets,
      project: args.project,
    }),
  };
}
