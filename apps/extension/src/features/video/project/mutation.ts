import type { VideoProject } from './types/index';

/**
 * Returns the canonical mutation timestamp for video-project updates.
 */
export function getVideoProjectMutationTimestamp(): number {
  return Date.now();
}

/**
 * Applies a project patch while keeping `updatedAt` owned by a single helper seam.
 */
export function applyVideoProjectMutationPatch(
  project: VideoProject,
  patch: Omit<Partial<VideoProject>, 'updatedAt'>
): VideoProject {
  return {
    ...project,
    ...patch,
    updatedAt: getVideoProjectMutationTimestamp(),
  };
}

export function applyVideoProjectClipsPatch(
  project: VideoProject,
  clips: VideoProject['clips']
): VideoProject {
  return applyVideoProjectMutationPatch(project, { clips });
}
