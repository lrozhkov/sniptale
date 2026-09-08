import type { VideoProject } from '../../../features/video/project/types';
import { saveVideoProject } from './index';

export interface CommitVideoProjectMutationOptions {
  baseRevision?: number | null;
  expectedWorkspaceRevision?: number | null;
}

export interface VideoProjectWorkspaceCommit {
  project: VideoProject;
  workspaceRevision: number;
}

export async function commitVideoProjectMutation(
  project: VideoProject,
  options: CommitVideoProjectMutationOptions = {}
): Promise<VideoProject> {
  const entry = await saveVideoProject(project, {
    baseUpdatedAt: options.baseRevision ?? null,
    ...(options.expectedWorkspaceRevision === undefined
      ? {}
      : { expectedWorkspaceRevision: options.expectedWorkspaceRevision }),
    storageClass: 'library',
  });
  return entry.project;
}

export async function commitVideoProjectWorkspaceMutation(
  project: VideoProject,
  options: {
    expectedWorkspaceRevision: number | null;
  }
): Promise<VideoProjectWorkspaceCommit> {
  const entry = await saveVideoProject(project, {
    expectedWorkspaceRevision: options.expectedWorkspaceRevision,
    storageClass: 'library',
  });
  return { project: entry.project, workspaceRevision: entry.workspaceRevision ?? 0 };
}
