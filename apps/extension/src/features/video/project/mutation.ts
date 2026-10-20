import type { VideoProject } from './types/index';

/**
 * Returns the canonical mutation timestamp for video-project updates.
 */
export function getVideoProjectMutationTimestamp(): number {
  return Date.now();
}

type MutationPatch = Omit<Partial<VideoProject>, 'updatedAt'>;

function getMutationSchemaVersion(
  project: VideoProject,
  patch: MutationPatch
): VideoProject['version'] {
  const requirements = [
    project.version,
    motionSchemaRequirement(patch.motionRegions ?? project.motionRegions),
    clipSchemaRequirement(patch.clips ?? project.clips),
    projectSchemaRequirement(project, patch),
  ];
  return requirements.reduce(
    (version, required) => (required > version ? required : version),
    project.version
  );
}

function motionSchemaRequirement(regions: VideoProject['motionRegions']): VideoProject['version'] {
  if (
    regions?.some(
      (region) => region.spotlight !== undefined || region.spotlightTarget !== undefined
    )
  )
    return 22;
  if (regions?.some((region) => region.border !== undefined || region.borderTarget !== undefined))
    return 21;
  if (
    regions?.some(
      (region) =>
        region.perspective !== undefined ||
        region.depthOfField !== undefined ||
        region.spatialReference !== undefined
    )
  )
    return 19;
  if (regions?.some((region) => region.phaseTransitions !== undefined)) return 18;
  if (regions?.some((region) => region.motionBlur !== undefined)) return 17;
  if (regions?.some((region) => region.cameraFollow !== undefined)) return 4;
  return 2;
}

function clipSchemaRequirement(clips: VideoProject['clips']): VideoProject['version'] {
  if (
    clips.some(
      (clip) =>
        (clip.type === 'VIDEO' || clip.type === 'IMAGE') && clip.windowCornerRadius !== undefined
    )
  )
    return 15;
  if (
    clips.some(
      (clip) => (clip.type === 'VIDEO' || clip.type === 'IMAGE') && clip.sourceCrop !== undefined
    )
  )
    return 13;
  if (clips.some((clip) => clip.type === 'VIDEO' && clip.cameraHiddenRanges !== undefined))
    return 12;
  if (
    clips.some(
      (clip) =>
        clip.type === 'VIDEO' &&
        clip.cameraPositions?.some((position) => position.crop !== undefined)
    )
  )
    return 11;
  if (clips.some((clip) => clip.type === 'VIDEO' && clip.cameraAppearance?.shape === 'circle'))
    return 10;
  if (
    clips.some(
      (clip) => (clip.type === 'VIDEO' || clip.type === 'IMAGE') && clip.shadowColor !== undefined
    )
  )
    return 9;
  if (clips.some((clip) => clip.type === 'VIDEO' && clip.cameraMirrored !== undefined)) return 8;
  if (clips.some((clip) => clip.type === 'AUDIO' && clip.originalAudioMute !== undefined)) return 6;
  return 2;
}

function projectSchemaRequirement(
  project: VideoProject,
  patch: MutationPatch
): VideoProject['version'] {
  if (project.watermark !== undefined || patch.watermark !== undefined) return 20;
  const background = patch.sceneBackground ?? project.sceneBackground;
  if (background?.blur !== undefined) return 16;
  if (
    background?.remembered !== undefined ||
    (background?.kind === 'image' && background.imageFit !== undefined)
  )
    return 14;
  if ((patch.tracks ?? project.tracks).some((track) => track.audioVolume !== undefined)) return 7;
  if (project.textDocuments !== undefined || patch.textDocuments !== undefined) return 5;
  if (project.cameraFollowDefaults !== undefined || patch.cameraFollowDefaults !== undefined)
    return 4;
  if (
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
