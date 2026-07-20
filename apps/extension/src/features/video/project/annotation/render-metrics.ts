import type { ResolvedAnnotationPresentation } from './template';

const MIN_ANNOTATION_CONTENT_SCALE = 0.001;
const MIN_ANNOTATION_INTERACTION_SCALE = 0.2;

function getBaseHeadlineFontSize(presentation: ResolvedAnnotationPresentation) {
  const fallbackLabelHeight =
    typeof presentation.style.padding === 'number' ? presentation.style.padding * 4 : 100;
  const labelHeight =
    presentation.labelFrame?.height ?? presentation.frame?.height ?? fallbackLabelHeight;
  return Math.max(18, labelHeight * 0.18);
}

function getBaseSublineFontSize(headlineFontSize: number) {
  return Math.max(12, headlineFontSize * 0.54);
}

export interface ResolvedAnnotationRenderMetrics {
  contentScale: number;
  interactionScale: number;
  surfaceMetrics: {
    borderRadius: number;
    padding: number;
  };
  targetMetrics: {
    chevronSize: number;
    dotRadius: number;
    dotStrokeWidth: number;
    frameCornerRadius: number;
    frameInset: number;
    frameStrokeWidth: number;
    pulseGap: number;
    pulseStrokeWidth: number;
    ringInnerRadius: number;
    ringOuterRadius: number;
    ringStrokeWidth: number;
  };
  textMetrics: {
    badgeFontSize: number;
    badgeGap: number;
    badgeHeight: number;
    headlineFontSize: number;
    headlineLineHeight: number;
    markerHeadlineFontSize: number;
    sublineFontSize: number;
    sublineGap: number;
    sublineLineHeight: number;
  };
}

export function getAnnotationContentScale(displayScale: number) {
  return Math.max(MIN_ANNOTATION_CONTENT_SCALE, displayScale);
}

export function getAnnotationInteractionScale(displayScale: number) {
  return Math.max(MIN_ANNOTATION_INTERACTION_SCALE, displayScale);
}

export function resolveAnnotationRenderMetrics(
  presentation: ResolvedAnnotationPresentation,
  displayScale: number
): ResolvedAnnotationRenderMetrics {
  const contentScale = getAnnotationContentScale(displayScale);
  const interactionScale = getAnnotationInteractionScale(displayScale);
  const headlineFontSize = getBaseHeadlineFontSize(presentation) * contentScale;
  const sublineFontSize =
    getBaseSublineFontSize(getBaseHeadlineFontSize(presentation)) * contentScale;

  return {
    contentScale,
    interactionScale,
    surfaceMetrics: {
      borderRadius: presentation.style.borderRadius * contentScale,
      padding: presentation.style.padding * contentScale,
    },
    targetMetrics: {
      chevronSize: 10 * contentScale,
      dotRadius: 5 * contentScale,
      dotStrokeWidth: 1.5 * contentScale,
      frameCornerRadius: presentation.style.borderRadius * contentScale,
      frameInset: 6 * contentScale,
      frameStrokeWidth: Math.max(1.5, 2 * contentScale),
      pulseGap: 10 * contentScale,
      pulseStrokeWidth: Math.max(2, 2.5 * contentScale),
      ringInnerRadius: 4 * contentScale,
      ringOuterRadius: 12 * contentScale,
      ringStrokeWidth: 2.5 * contentScale,
    },
    textMetrics: {
      badgeFontSize: 12 * contentScale,
      badgeGap: 10 * contentScale,
      badgeHeight: presentation.style.padding * 1.15 * contentScale,
      headlineFontSize,
      headlineLineHeight: headlineFontSize * 1.05,
      markerHeadlineFontSize: 16 * contentScale,
      sublineFontSize,
      sublineGap: 10 * contentScale,
      sublineLineHeight: sublineFontSize * 1.2,
    },
  };
}
