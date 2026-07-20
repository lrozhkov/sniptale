import {
  createPartProgressState,
  createRevealState,
  createStaticAnimationState,
  resolveSweepProgress,
  type AnnotationAnimationState,
  type AnnotationMotionParams,
} from './motion-state';

export function createConnectorDrawState(params: AnnotationMotionParams): AnnotationAnimationState {
  const partProgress = createPartProgressState(params);
  const revealState = createRevealState(params, partProgress);

  return {
    ...createStaticAnimationState(),
    ...partProgress,
    ...revealState,
    connectorProgress: params.playbackProgress,
    headlineProgress: Math.max(partProgress.headlineProgress, params.playbackProgress * 0.92),
    headlineRevealProgress: Math.max(
      revealState.headlineRevealProgress,
      Math.max(0, (params.playbackProgress - 0.34) / 0.66)
    ),
    opacityMultiplier: 0.7 + params.playbackProgress * 0.3,
    shadowStrength: 0.88 + params.playbackProgress * 0.12,
    sublineProgress: Math.max(0, (params.playbackProgress - 0.22) / 0.78),
    sublineRevealProgress: Math.max(0, (params.playbackProgress - 0.38) / 0.62),
  };
}

export function createAnchorPopState(params: AnnotationMotionParams): AnnotationAnimationState {
  const partProgress = createPartProgressState(params);
  const revealState = createRevealState(params, partProgress);
  const connectorProgress = Math.max(0, (params.playbackProgress - 0.16) / 0.84);

  return {
    ...createStaticAnimationState(),
    ...partProgress,
    ...revealState,
    connectorProgress,
    headlineProgress: Math.max(0, (params.playbackProgress - 0.24) / 0.76),
    headlineRevealProgress: Math.max(0, (params.playbackProgress - 0.32) / 0.68),
    markerProgress: params.playbackProgress,
    opacityMultiplier: 0.62 + params.playbackProgress * 0.38,
    scaleMultiplier:
      0.92 +
      params.playbackProgress * 0.08 +
      Math.sin(params.playbackProgress * Math.PI) * 0.08 * params.intensityMultiplier,
    shadowStrength: 0.9 + params.playbackProgress * 0.1,
  };
}

export function createThreeDRevealState(params: AnnotationMotionParams): AnnotationAnimationState {
  const partProgress = createPartProgressState(params);
  const revealState = createRevealState(params, partProgress);
  const overshoot = Math.sin(params.playbackProgress * Math.PI) * 0.16 * params.intensityMultiplier;

  return {
    ...createStaticAnimationState(),
    ...partProgress,
    ...revealState,
    glossProgress: resolveSweepProgress(params.playbackProgress, params.phase, 0.3),
    opacityMultiplier: params.playbackProgress,
    scaleMultiplier: 0.84 + params.playbackProgress * 0.16 + overshoot,
    shadowStrength: 0.65 + params.playbackProgress * 0.35,
    translateX: (1 - params.playbackProgress) * params.motionDistance * 0.55 * params.directionSign,
    translateY: (1 - params.playbackProgress) * params.motionDistance * -0.24,
  };
}
