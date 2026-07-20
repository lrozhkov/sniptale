import type { ResolvedAnnotationIdleMotion } from './idle-motion';
import type { AnnotationAnimationState } from './motion-state';

export interface ResolvedAnnotationEffects {
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
  scaleMultiplier: number;
  shadowStrength: number;
  shimmerProgress: number | null;
  sublineProgress: number;
  sublineRevealProgress: number;
  translateX: number;
  translateY: number;
}

function resolveCombinedSweepProgress(
  introProgress: number | null,
  outroProgress: number | null
): number | null {
  const resolvedProgress = Math.max(introProgress ?? 0, outroProgress ?? 0);
  return resolvedProgress > 0 ? resolvedProgress : null;
}

export function resolveAnnotationEffects(
  intro: AnnotationAnimationState,
  outro: AnnotationAnimationState,
  idle: ResolvedAnnotationIdleMotion
): ResolvedAnnotationEffects {
  return {
    accentProgress: intro.accentProgress * outro.accentProgress,
    accentWidthMultiplier: intro.accentWidthMultiplier * outro.accentWidthMultiplier,
    badgeProgress: intro.badgeProgress * outro.badgeProgress,
    // Keep steady-state templates sharp; blur remains motion-only.
    blurPx: Math.max(intro.blurPx, outro.blurPx),
    connectorProgress: intro.connectorProgress * outro.connectorProgress,
    glossProgress:
      resolveCombinedSweepProgress(intro.glossProgress, outro.glossProgress) ?? idle.glossProgress,
    headlineProgress: intro.headlineProgress * outro.headlineProgress,
    headlineRevealProgress: intro.headlineRevealProgress * outro.headlineRevealProgress,
    maskProgress: Math.min(intro.maskProgress, outro.maskProgress),
    markerProgress: intro.markerProgress * outro.markerProgress,
    scaleMultiplier: intro.scaleMultiplier * outro.scaleMultiplier * idle.scaleMultiplier,
    shadowStrength: Math.min(intro.shadowStrength, outro.shadowStrength) * idle.shadowStrength,
    shimmerProgress: intro.shimmerProgress ?? outro.shimmerProgress ?? idle.shimmerProgress,
    sublineProgress: intro.sublineProgress * outro.sublineProgress,
    sublineRevealProgress: intro.sublineRevealProgress * outro.sublineRevealProgress,
    translateX: intro.translateX + outro.translateX,
    translateY: intro.translateY + outro.translateY + idle.translateY,
  };
}
