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
  if (regions?.some((region) => region.spotlightTarget === 'source-scene')) return 39;
  if (
    regions?.some(
      (region) =>
        region.focusArea?.axes !== undefined ||
        region.phaseTransitions?.link !== undefined ||
        region.sourceBinding?.unresolvedLinkTo !== undefined ||
        region.sourceBinding?.dormant !== undefined ||
        region.sourceBinding?.phaseProjection !== undefined ||
        region.sourceBinding?.coordinateSpace !== undefined
    )
  )
    return 34;
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
  if (clips.some((clip) => clip.type === 'AUDIO' && clip.transcript !== undefined)) return 44;
  if (clips.some((clip) => clip.playbackWindow !== undefined)) return 43;
  if (
    clips.some(
      (clip) =>
        clip.type === 'EFFECT' && (clip.attachment !== undefined || clip.sourceRange !== undefined)
    )
  )
    return 38;
  if (
    clips.some(
      (clip) =>
        (clip.type === 'VIDEO' || clip.type === 'IMAGE') &&
        clip.rememberedWindowLayout !== undefined
    )
  )
    return 36;
  if (
    clips.some(
      (clip) =>
        (clip.type === 'VIDEO' || clip.type === 'IMAGE') &&
        (clip.rememberedWindowHeader !== undefined || clip.rememberedSourceCrop !== undefined)
    )
  )
    return 35;
  if (clips.some((clip) => clip.type === 'VIDEO' && clip.cameraTiming !== undefined)) return 32;
  if (clips.some((clip) => clip.type === 'AUDIO' && clip.durationMode !== undefined)) return 30;
  if (
    clips.some(
      (clip) => (clip.type === 'VIDEO' || clip.type === 'AUDIO') && (clip.playbackRate ?? 1) < 0.1
    )
  )
    return 27;
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
  if (clips.some((clip) => clip.type === 'VIDEO' && clip.cameraTiming !== undefined)) return 32;
  if (clips.some((clip) => clip.type === 'AUDIO' && clip.originalAudioMute !== undefined)) return 6;
  return 2;
}

function projectSchemaRequirement(
  project: VideoProject,
  patch: MutationPatch
): VideoProject['version'] {
  if (patch.watermarkSource !== undefined || project.watermarkSource !== undefined) return 42;
  const bookends = patch.bookendPresets ?? project.bookendPresets;
  if (bookends?.intro.edgeControl !== undefined || bookends?.outro.edgeControl !== undefined)
    return 41;
  if (
    (patch.compositionJoins ?? project.compositionJoins)?.some(
      (join) => join.sampling !== undefined
    )
  )
    return 40;
  const sceneBackground = patch.sceneBackground ?? project.sceneBackground;
  if (sceneBackground?.zoomBehavior !== undefined) return 37;
  if (
    project.watermarkEnabled !== undefined ||
    patch.watermarkEnabled !== undefined ||
    sceneBackground?.enabled !== undefined ||
    sceneBackground?.rememberedBlur !== undefined
  )
    return 36;
  if ((patch.rememberedCanvas ?? project.rememberedCanvas) !== undefined) return 35;
  if ((patch.cursorTrack ?? project.cursorTrack)?.sourceObservations !== undefined) return 33;
  if (
    project.sourceVoiceoverDocuments !== undefined ||
    patch.sourceVoiceoverDocuments !== undefined ||
    (patch.sourceAudioDocuments ?? project.sourceAudioDocuments)?.some(
      (document) => document.speech !== undefined
    )
  )
    return 31;
  if (
    (patch.textDocuments ?? project.textDocuments)?.some(
      (entry) => entry.durationMode !== undefined
    )
  )
    return 29;
  if (project.sourceAudioDocuments !== undefined || patch.sourceAudioDocuments !== undefined)
    return 28;
  const presets = patch.bookendPresets ?? project.bookendPresets;
  if (
    project.compositionJoins !== undefined ||
    patch.compositionJoins !== undefined ||
    presets?.introTransition !== undefined ||
    presets?.outroTransition !== undefined
  )
    return 26;
  if (project.bookendPresets !== undefined || patch.bookendPresets !== undefined) return 25;
  if (project.sceneEdges !== undefined || patch.sceneEdges !== undefined) return 24;
  if (project.commentDocuments !== undefined || patch.commentDocuments !== undefined) return 23;
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
