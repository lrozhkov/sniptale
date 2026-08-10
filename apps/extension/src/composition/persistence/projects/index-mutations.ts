import type { VideoProject } from '../../../features/video/project/types';
import { getVideoProject, saveVideoProject } from './index';
import { resolveVideoProjectReadResult } from './contracts';
import { loadSettings } from '../settings';
import { DEFAULT_LOCAL_STORAGE_POLICY } from '../library-lifecycle';
import type { LibraryStorageClass } from '../library-lifecycle';

export interface CommitVideoProjectMutationOptions {
  baseRevision?: number | null;
  expectedWorkspaceRevision?: number | null;
  storageClass?: LibraryStorageClass;
}

export interface VideoProjectWorkspaceCommit {
  project: VideoProject;
  workspaceRevision: number;
}

export function commitVideoProjectMutation(
  project: VideoProject,
  options: CommitVideoProjectMutationOptions = {}
): Promise<VideoProject> {
  return commitVideoProjectMutationAndReadBack(project, options);
}

async function commitVideoProjectMutationAndReadBack(
  project: VideoProject,
  options: CommitVideoProjectMutationOptions
): Promise<VideoProject> {
  const settings =
    options.storageClass === undefined && options.baseRevision == null
      ? await loadSettings().catch(() => null)
      : null;
  await saveVideoProject(project, {
    baseUpdatedAt: options.baseRevision ?? null,
    ...(options.expectedWorkspaceRevision === undefined
      ? {}
      : { expectedWorkspaceRevision: options.expectedWorkspaceRevision }),
    storageClass:
      options.storageClass ??
      settings?.localStoragePolicy.defaultDestination ??
      DEFAULT_LOCAL_STORAGE_POLICY.defaultDestination,
  });
  const result = await getVideoProject(project.id);
  const savedProject = resolveVideoProjectReadResult(result);
  return savedProject ?? project;
}

export async function commitVideoProjectWorkspaceMutation(
  project: VideoProject,
  options: {
    expectedWorkspaceRevision: number | null;
    storageClass?: LibraryStorageClass;
  }
): Promise<VideoProjectWorkspaceCommit> {
  const settings =
    options.storageClass === undefined && options.expectedWorkspaceRevision === null
      ? await loadSettings().catch(() => null)
      : null;
  const entry = await saveVideoProject(project, {
    expectedWorkspaceRevision: options.expectedWorkspaceRevision,
    storageClass:
      options.storageClass ??
      settings?.localStoragePolicy.defaultDestination ??
      DEFAULT_LOCAL_STORAGE_POLICY.defaultDestination,
  });
  return { project: entry.project, workspaceRevision: entry.workspaceRevision ?? 0 };
}
