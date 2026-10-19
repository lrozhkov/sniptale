import type { VideoProject } from './types/index';

/**
 * Returns the canonical mutation timestamp for video-project updates.
 */
export function getVideoProjectMutationTimestamp(): number {
  return Date.now();
}

function getMutationSchemaVersion(
  project: VideoProject,
  patch: Omit<Partial<VideoProject>, 'updatedAt'>
): VideoProject['version'] {
  if (
    project.version === 8 ||
    (patch.clips ?? project.clips).some(
      (clip) => clip.type === 'VIDEO' && clip.cameraMirrored !== undefined
    )
  )
    return 8;
  if (
    project.version === 7 ||
    (patch.tracks ?? project.tracks).some((track) => track.audioVolume !== undefined)
  )
    return 7;
  if (
    project.version === 6 ||
    (patch.clips ?? project.clips).some(
      (clip) => clip.type === 'AUDIO' && clip.originalAudioMute !== undefined
    )
  )
    return 6;
  if (
    project.version === 5 ||
    project.textDocuments !== undefined ||
    patch.textDocuments !== undefined
  )
    return 5;
  if (
    project.version === 4 ||
    project.cameraFollowDefaults !== undefined ||
    patch.cameraFollowDefaults !== undefined ||
    (patch.motionRegions ?? project.motionRegions)?.some(
      (region) => region.cameraFollow !== undefined
    )
  )
    return 4;
  if (
    project.version === 3 ||
    project.cursorFocusPath !== undefined ||
    project.actionFeedback !== undefined ||
    patch.cursorFocusPath !== undefined ||
    patch.actionFeedback !== undefined
  )
    return 3;
  return 2;
}

/** Applies a project patch while retaining the schema and the sole mutation timestamp owner. */
export function applyVideoProjectMutationPatch(
  project: VideoProject,
  patch: Omit<Partial<VideoProject>, 'updatedAt'>
): VideoProject {
  return {
    ...project,
    ...patch,
    version: getMutationSchemaVersion(project, patch),
    updatedAt: getVideoProjectMutationTimestamp(),
  };
}

export function applyVideoProjectClipsPatch(
  project: VideoProject,
  clips: VideoProject['clips']
): VideoProject {
  return applyVideoProjectMutationPatch(project, { clips });
}
