import { VideoOverlayTemplateKind, type VideoProjectAnnotationClip } from '../types/index';

interface AnnotationIdleProfile {
  floatAmount: number;
  floatCycleSeconds: number;
  glossCycleSeconds: number | null;
  glossOffset: number;
  scalePulseAmount: number;
  shadowPulseAmount: number;
  shimmerCycleSeconds: number | null;
  shimmerOffset: number;
}

type AnnotationIdleTemplateKind =
  | (typeof VideoOverlayTemplateKind)['LOWER_THIRD_BADGE']
  | (typeof VideoOverlayTemplateKind)['LOWER_THIRD_STATUS_TICKER']
  | (typeof VideoOverlayTemplateKind)['FEATURE_SPOTLIGHT_CARD']
  | (typeof VideoOverlayTemplateKind)['FOCUS_SCAN_FRAME']
  | (typeof VideoOverlayTemplateKind)['SHIMMER_LABEL']
  | (typeof VideoOverlayTemplateKind)['TITLE_CURSOR_REVEAL']
  | (typeof VideoOverlayTemplateKind)['SCENE_PROGRESS_CARD']
  | (typeof VideoOverlayTemplateKind)['THREE_D_REVEAL_CARD'];

export interface ResolvedAnnotationIdleMotion {
  glossProgress: number | null;
  scaleMultiplier: number;
  shadowStrength: number;
  shimmerProgress: number | null;
  translateY: number;
}

function createStaticIdleMotion(): ResolvedAnnotationIdleMotion {
  return {
    glossProgress: null,
    scaleMultiplier: 1,
    shadowStrength: 1,
    shimmerProgress: null,
    translateY: 0,
  };
}

const ANNOTATION_IDLE_PROFILES: Record<AnnotationIdleTemplateKind, AnnotationIdleProfile> = {
  [VideoOverlayTemplateKind.LOWER_THIRD_BADGE]: {
    floatAmount: 0.8,
    floatCycleSeconds: 2.8,
    glossCycleSeconds: 2.9,
    glossOffset: 0.08,
    scalePulseAmount: 0.005,
    shadowPulseAmount: 0.05,
    shimmerCycleSeconds: null,
    shimmerOffset: 0,
  },
  [VideoOverlayTemplateKind.LOWER_THIRD_STATUS_TICKER]: {
    floatAmount: 0.5,
    floatCycleSeconds: 2.6,
    glossCycleSeconds: 2.7,
    glossOffset: 0.18,
    scalePulseAmount: 0.004,
    shadowPulseAmount: 0.04,
    shimmerCycleSeconds: 2.4,
    shimmerOffset: 0.22,
  },
  [VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD]: {
    floatAmount: 1.2,
    floatCycleSeconds: 3.2,
    glossCycleSeconds: 3.4,
    glossOffset: 0.16,
    scalePulseAmount: 0.006,
    shadowPulseAmount: 0.08,
    shimmerCycleSeconds: null,
    shimmerOffset: 0,
  },
  [VideoOverlayTemplateKind.FOCUS_SCAN_FRAME]: {
    floatAmount: 1,
    floatCycleSeconds: 2.8,
    glossCycleSeconds: 3,
    glossOffset: 0.12,
    scalePulseAmount: 0.006,
    shadowPulseAmount: 0.07,
    shimmerCycleSeconds: 2.2,
    shimmerOffset: 0.06,
  },
  [VideoOverlayTemplateKind.SHIMMER_LABEL]: {
    floatAmount: 0.6,
    floatCycleSeconds: 2.4,
    glossCycleSeconds: null,
    glossOffset: 0,
    scalePulseAmount: 0.004,
    shadowPulseAmount: 0.03,
    shimmerCycleSeconds: 2.1,
    shimmerOffset: 0.12,
  },
  [VideoOverlayTemplateKind.TITLE_CURSOR_REVEAL]: {
    floatAmount: 0.4,
    floatCycleSeconds: 2.5,
    glossCycleSeconds: null,
    glossOffset: 0,
    scalePulseAmount: 0.003,
    shadowPulseAmount: 0.04,
    shimmerCycleSeconds: 2,
    shimmerOffset: 0.24,
  },
  [VideoOverlayTemplateKind.SCENE_PROGRESS_CARD]: {
    floatAmount: 0.7,
    floatCycleSeconds: 2.7,
    glossCycleSeconds: 2.8,
    glossOffset: 0.14,
    scalePulseAmount: 0.005,
    shadowPulseAmount: 0.05,
    shimmerCycleSeconds: 2.3,
    shimmerOffset: 0.1,
  },
  [VideoOverlayTemplateKind.THREE_D_REVEAL_CARD]: {
    floatAmount: 2.4,
    floatCycleSeconds: 3,
    glossCycleSeconds: 3.1,
    glossOffset: 0.22,
    scalePulseAmount: 0.014,
    shadowPulseAmount: 0.12,
    shimmerCycleSeconds: null,
    shimmerOffset: 0,
  },
};

function isIdleTemplateKind(
  templateKind: VideoProjectAnnotationClip['templateKind']
): templateKind is AnnotationIdleTemplateKind {
  return (
    templateKind === VideoOverlayTemplateKind.LOWER_THIRD_BADGE ||
    templateKind === VideoOverlayTemplateKind.LOWER_THIRD_STATUS_TICKER ||
    templateKind === VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD ||
    templateKind === VideoOverlayTemplateKind.FOCUS_SCAN_FRAME ||
    templateKind === VideoOverlayTemplateKind.SHIMMER_LABEL ||
    templateKind === VideoOverlayTemplateKind.TITLE_CURSOR_REVEAL ||
    templateKind === VideoOverlayTemplateKind.SCENE_PROGRESS_CARD ||
    templateKind === VideoOverlayTemplateKind.THREE_D_REVEAL_CARD
  );
}

function resolveIdleProfile(
  templateKind: VideoProjectAnnotationClip['templateKind']
): AnnotationIdleProfile | null {
  return isIdleTemplateKind(templateKind) ? ANNOTATION_IDLE_PROFILES[templateKind] : null;
}

function resolveIdleElapsedTime(clip: VideoProjectAnnotationClip, currentTime: number) {
  const holdStart = clip.startTime + clip.introDurationMs / 1000;
  const holdEnd = clip.startTime + clip.duration - clip.outroDurationMs / 1000;

  if (holdEnd <= holdStart || currentTime < holdStart || currentTime > holdEnd) {
    return null;
  }

  return currentTime - holdStart;
}

function resolveCycleProgress(
  elapsedTime: number,
  cycleSeconds: number | null,
  offset: number
): number | null {
  if (cycleSeconds === null || cycleSeconds <= 0) {
    return null;
  }

  return (elapsedTime / cycleSeconds + offset) % 1;
}

function resolveWave(elapsedTime: number, cycleSeconds: number, amount: number) {
  if (cycleSeconds <= 0 || amount === 0) {
    return 0;
  }

  return Math.sin((elapsedTime / cycleSeconds) * Math.PI * 2) * amount;
}

export function resolveAnnotationIdleMotion(
  clip: VideoProjectAnnotationClip,
  currentTime: number
): ResolvedAnnotationIdleMotion {
  const idleElapsedTime = resolveIdleElapsedTime(clip, currentTime);
  if (idleElapsedTime === null) {
    return createStaticIdleMotion();
  }

  const profile = resolveIdleProfile(clip.templateKind);
  if (profile === null) {
    return createStaticIdleMotion();
  }

  const scalePulse = resolveWave(
    idleElapsedTime,
    profile.floatCycleSeconds,
    profile.scalePulseAmount
  );
  const shadowPulse = resolveWave(
    idleElapsedTime,
    profile.floatCycleSeconds,
    profile.shadowPulseAmount
  );

  return {
    glossProgress: resolveCycleProgress(
      idleElapsedTime,
      profile.glossCycleSeconds,
      profile.glossOffset
    ),
    scaleMultiplier: 1 + scalePulse,
    shadowStrength: 1 + shadowPulse,
    shimmerProgress: resolveCycleProgress(
      idleElapsedTime,
      profile.shimmerCycleSeconds,
      profile.shimmerOffset
    ),
    translateY: resolveWave(idleElapsedTime, profile.floatCycleSeconds, profile.floatAmount),
  };
}
