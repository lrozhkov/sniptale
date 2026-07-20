import { VideoOverlayAnimationKind } from '../types/index';
import {
  createAnchorPopState,
  createConnectorDrawState,
  createThreeDRevealState,
} from './motion-callouts';
import {
  createPartProgressState,
  createRevealState,
  createStaticAnimationState,
  resolveSweepProgress,
  type AnnotationAnimationState,
  type AnnotationMotionParams,
} from './motion-state';

function createSlideAnimationState(
  params: AnnotationMotionParams,
  axis: 'x' | 'y'
): AnnotationAnimationState {
  const partProgress = createPartProgressState(params);
  const revealState = createRevealState(params, partProgress);

  return {
    ...createStaticAnimationState(),
    ...partProgress,
    ...revealState,
    opacityMultiplier: params.playbackProgress,
    scaleMultiplier: 0.98 + params.playbackProgress * 0.02,
    shadowStrength: 0.8 + params.playbackProgress * 0.2,
    translateX:
      axis === 'x'
        ? (1 - params.playbackProgress) * params.motionDistance * params.directionSign
        : 0,
    translateY:
      axis === 'y'
        ? (1 - params.playbackProgress) * params.motionDistance * -params.directionSign
        : 0,
  };
}

function createRevealMaskState(params: AnnotationMotionParams): AnnotationAnimationState {
  const partProgress = createPartProgressState(params);
  const revealState = createRevealState(params, partProgress);

  return {
    ...createStaticAnimationState(),
    ...partProgress,
    ...revealState,
    maskProgress: params.playbackProgress,
    opacityMultiplier: 0.65 + params.playbackProgress * 0.35,
    scaleMultiplier: 0.99 + params.playbackProgress * 0.01,
  };
}

function createShimmerEntryState(params: AnnotationMotionParams): AnnotationAnimationState {
  const partProgress = createPartProgressState(params);
  const revealState = createRevealState(params, partProgress);

  return {
    ...createStaticAnimationState(),
    ...partProgress,
    ...revealState,
    opacityMultiplier: params.playbackProgress,
    scaleMultiplier: 0.97 + params.playbackProgress * 0.03,
    shadowStrength: 0.88 + params.playbackProgress * 0.12,
    shimmerProgress: resolveSweepProgress(params.playbackProgress, params.phase, 0.04),
    translateY: (1 - params.playbackProgress) * params.motionDistance * 0.35,
  };
}

function createBlurRevealState(params: AnnotationMotionParams): AnnotationAnimationState {
  const partProgress = createPartProgressState(params);
  const revealState = createRevealState(params, partProgress);
  const overshoot = Math.sin(params.playbackProgress * Math.PI) * 0.02 * params.intensityMultiplier;

  return {
    ...createStaticAnimationState(),
    ...partProgress,
    ...revealState,
    blurPx: (1 - params.playbackProgress) * 12 * params.intensityMultiplier,
    opacityMultiplier: 0.35 + params.playbackProgress * 0.65,
    scaleMultiplier: 0.92 + params.playbackProgress * 0.08 + overshoot,
    shadowStrength: 0.7 + params.playbackProgress * 0.3,
  };
}

function createScaleFadeState(params: AnnotationMotionParams): AnnotationAnimationState {
  const partProgress = createPartProgressState(params);
  const revealState = createRevealState(params, partProgress);
  const overshoot = Math.sin(params.playbackProgress * Math.PI) * 0.12 * params.intensityMultiplier;

  return {
    ...createStaticAnimationState(),
    ...partProgress,
    ...revealState,
    opacityMultiplier: params.playbackProgress,
    scaleMultiplier: 0.88 + params.playbackProgress * 0.12 + overshoot,
    shadowStrength: 0.78 + params.playbackProgress * 0.22,
  };
}

function createShimmerSweepState(params: AnnotationMotionParams): AnnotationAnimationState {
  const partProgress = createPartProgressState(params);
  const revealState = createRevealState(params, partProgress);

  return {
    ...createStaticAnimationState(),
    ...partProgress,
    ...revealState,
    glossProgress: resolveSweepProgress(params.playbackProgress, params.phase, 0.2),
    opacityMultiplier: params.playbackProgress,
    scaleMultiplier: 0.97 + params.playbackProgress * 0.03,
    shadowStrength: 0.88 + params.playbackProgress * 0.12,
    translateY: (1 - params.playbackProgress) * params.motionDistance * 0.12,
  };
}

export function createAnimatedState(params: AnnotationMotionParams): AnnotationAnimationState {
  switch (params.animation) {
    case VideoOverlayAnimationKind.NONE:
      return createStaticAnimationState();
    case VideoOverlayAnimationKind.SLIDE_LEFT_FADE:
      return createSlideAnimationState(params, 'x');
    case VideoOverlayAnimationKind.REVEAL_MASK:
      return createRevealMaskState(params);
    case VideoOverlayAnimationKind.CONNECTOR_DRAW:
      return createConnectorDrawState(params);
    case VideoOverlayAnimationKind.ANCHOR_POP:
      return createAnchorPopState(params);
    case VideoOverlayAnimationKind.SHIMMER_ENTRY:
      return createShimmerEntryState(params);
    case VideoOverlayAnimationKind.SOFT_BLUR_REVEAL:
      return createBlurRevealState(params);
    case VideoOverlayAnimationKind.SCALE_FADE:
      return createScaleFadeState(params);
    case VideoOverlayAnimationKind.SHIMMER_SWEEP:
      return createShimmerSweepState(params);
    case VideoOverlayAnimationKind.THREE_D_REVEAL:
      return createThreeDRevealState(params);
    case VideoOverlayAnimationKind.SLIDE_UP_FADE:
      return createSlideAnimationState(params, 'y');
  }
}
