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
    version:
      project.version === 4 ||
      project.cameraFollowDefaults !== undefined ||
      patch.cameraFollowDefaults !== undefined ||
      (patch.motionRegions ?? project.motionRegions)?.some(
        (region) => region.cameraFollow !== undefined
      )
        ? 4
        : project.version === 3 ||
            project.cursorFocusPath !== undefined ||
            project.actionFeedback !== undefined ||
            patch.cursorFocusPath !== undefined ||
            patch.actionFeedback !== undefined
          ? 3
          : 2,
    updatedAt: getVideoProjectMutationTimestamp(),
  };
}

export function applyVideoProjectClipsPatch(
  project: VideoProject,
  clips: VideoProject['clips']
): VideoProject {
  return applyVideoProjectMutationPatch(project, { clips });
}
