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
    project.version === 21 ||
    (patch.motionRegions ?? project.motionRegions)?.some(
      (region) => region.border !== undefined || region.borderTarget !== undefined
    )
  )
    return 21;
  if (project.version === 20 || project.watermark !== undefined || patch.watermark !== undefined)
    return 20;
  if (
    project.version === 19 ||
    (patch.motionRegions ?? project.motionRegions)?.some(
      (region) =>
        region.perspective !== undefined ||
        region.depthOfField !== undefined ||
        region.spatialReference !== undefined
    )
  )
    return 19;
  if (
    project.version === 18 ||
    (patch.motionRegions ?? project.motionRegions)?.some(
      (region) => region.phaseTransitions !== undefined
    )
  )
    return 18;
  if (
    project.version === 17 ||
    (patch.motionRegions ?? project.motionRegions)?.some(
      (region) => region.motionBlur !== undefined
    )
  )
    return 17;
  if (
    project.version === 16 ||
    (patch.sceneBackground ?? project.sceneBackground)?.blur !== undefined
  )
    return 16;
  if (
    project.version === 15 ||
    (patch.clips ?? project.clips).some(
      (clip) =>
        (clip.type === 'VIDEO' || clip.type === 'IMAGE') && clip.windowCornerRadius !== undefined
    )
  )
    return 15;
  const background = patch.sceneBackground ?? project.sceneBackground;
  if (
    project.version === 14 ||
    background?.remembered !== undefined ||
    (background?.kind === 'image' && background.imageFit !== undefined)
  )
    return 14;
  if (
    project.version === 13 ||
    (patch.clips ?? project.clips).some(
      (clip) => (clip.type === 'VIDEO' || clip.type === 'IMAGE') && clip.sourceCrop !== undefined
    )
  )
    return 13;
  if (
    project.version === 12 ||
    (patch.clips ?? project.clips).some(
      (clip) => clip.type === 'VIDEO' && clip.cameraHiddenRanges !== undefined
    )
  )
    return 12;
  if (
    project.version === 11 ||
    (patch.clips ?? project.clips).some(
      (clip) =>
        clip.type === 'VIDEO' &&
        clip.cameraPositions?.some((position) => position.crop !== undefined)
    )
  )
    return 11;
  if (
    project.version === 10 ||
    (patch.clips ?? project.clips).some(
      (clip) => clip.type === 'VIDEO' && clip.cameraAppearance?.shape === 'circle'
    )
  )
    return 10;
  if (
    project.version === 9 ||
    (patch.clips ?? project.clips).some(
      (clip) => (clip.type === 'VIDEO' || clip.type === 'IMAGE') && clip.shadowColor !== undefined
    )
  )
    return 9;
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
