import type { VideoProjectAnnotationClip } from '../types/index';
import { resolveAnnotationPartDelays, resolveAnnotationRevealProfile } from './motion-presets';

export interface AnnotationAnimationState {
  accentProgress: number;
  accentWidthMultiplier: number;
  badgeProgress: number;
  blurPx: number;
  connectorProgress: number;
  glossProgress: number | null;
  headlineProgress: number;
  headlineRevealProgress: number;
  maskProgress: number;
  markerProgress: number;
  opacityMultiplier: number;
  scaleMultiplier: number;
  shadowStrength: number;
  shimmerProgress: number | null;
  sublineProgress: number;
  sublineRevealProgress: number;
  translateX: number;
  translateY: number;
}

export interface AnnotationMotionParams {
  animation: VideoProjectAnnotationClip['introAnimation'];
  clip: VideoProjectAnnotationClip;
  directionSign: number;
  intensityMultiplier: number;
  motionDistance: number;
  phase: 'intro' | 'outro';
  playbackProgress: number;
}

function clampProgress(value: number) {
  return Math.min(1, Math.max(0, value));
}

function resolveStaggerProgress(playbackProgress: number, delay: number) {
  return clampProgress((playbackProgress - delay) / Math.max(0.001, 1 - delay));
}

export function resolveSweepProgress(
  playbackProgress: number,
  phase: AnnotationMotionParams['phase'],
  delay: number
) {
  const baseProgress = phase === 'intro' ? playbackProgress : 1 - playbackProgress;
  return resolveStaggerProgress(baseProgress, delay);
}

export function createStaticAnimationState(): AnnotationAnimationState {
  return {
    accentProgress: 1,
    accentWidthMultiplier: 1,
    badgeProgress: 1,
    blurPx: 0,
    connectorProgress: 1,
    glossProgress: null,
    headlineProgress: 1,
    headlineRevealProgress: 1,
    maskProgress: 1,
    markerProgress: 1,
    opacityMultiplier: 1,
    scaleMultiplier: 1,
    shadowStrength: 1,
    shimmerProgress: null,
    sublineProgress: 1,
    sublineRevealProgress: 1,
    translateX: 0,
    translateY: 0,
  };
}

export function createPartProgressState(params: AnnotationMotionParams) {
  const delays = resolveAnnotationPartDelays(params.clip.templateKind);

  return {
    accentProgress: resolveStaggerProgress(params.playbackProgress, delays.accent),
    badgeProgress: resolveStaggerProgress(params.playbackProgress, delays.badge),
    headlineProgress: resolveStaggerProgress(params.playbackProgress, delays.headline),
    sublineProgress: resolveStaggerProgress(params.playbackProgress, delays.subline),
  };
}

export function createRevealState(
  params: AnnotationMotionParams,
  partProgress: ReturnType<typeof createPartProgressState>
) {
  const profile = resolveAnnotationRevealProfile(params.clip.templateKind);

  return {
    accentWidthMultiplier:
      profile.accentWidthFrom + partProgress.accentProgress * (1 - profile.accentWidthFrom),
    headlineRevealProgress: resolveStaggerProgress(
      partProgress.headlineProgress,
      profile.headlineRevealDelay
    ),
    sublineRevealProgress: resolveStaggerProgress(
      partProgress.sublineProgress,
      profile.sublineRevealDelay
    ),
  };
}
