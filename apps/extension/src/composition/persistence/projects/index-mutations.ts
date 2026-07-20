import type { VideoProject } from '../../../features/video/project/types';
import { getVideoProject, saveVideoProject } from './index';
import { resolveVideoProjectReadResult } from './contracts';

export interface CommitVideoProjectMutationOptions {
  baseRevision?: number | null;
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
  await saveVideoProject(project, {
    baseUpdatedAt: options.baseRevision ?? null,
  });
  const result = await getVideoProject(project.id);
  const savedProject = resolveVideoProjectReadResult(result);
  return savedProject ?? project;
}
