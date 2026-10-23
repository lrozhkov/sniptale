import type { SaveVideoProjectOptions } from './index.save-guard';
import type { VideoProject } from '../../../features/video/project/types';
import { saveVideoProject } from './index';

export interface CommitVideoProjectMutationOptions {
  baseRevision?: number | null;
  expectedWorkspaceRevision?: number | null;
  expectedReviewWorkspace?: SaveVideoProjectOptions['expectedReviewWorkspace'];
  libraryBindings?: SaveVideoProjectOptions['libraryBindings'];
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
    ...(options.expectedReviewWorkspace === undefined
      ? {}
      : { expectedReviewWorkspace: options.expectedReviewWorkspace }),
    ...(options.libraryBindings ? { libraryBindings: options.libraryBindings } : {}),
    storageClass: 'library',
  });
  return entry.project;
}

export async function commitVideoProjectWorkspaceMutation(
  project: VideoProject,
  options: {
    expectedWorkspaceRevision: number | null;
    expectedProject: VideoProject | null;
  }
): Promise<VideoProjectWorkspaceCommit> {
  const entry = await saveVideoProject(project, {
    expectedWorkspaceRevision: options.expectedWorkspaceRevision,
    expectedProject: structuredClone(options.expectedProject),
    storageClass: 'library',
  });
  return { project: entry.project, workspaceRevision: entry.workspaceRevision ?? 0 };
}
