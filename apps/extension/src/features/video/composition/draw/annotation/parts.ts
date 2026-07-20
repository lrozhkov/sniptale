import {
  resolveAnnotationRenderMetrics,
  type ResolvedAnnotationRenderMetrics,
} from '../../../project/annotation/render-metrics';
import type { VideoCompositionResolvedAnnotationClip } from '../../types';
import { drawRoundedRectPath, wrapText } from '../shared';
import { runWithMotionState, withRevealClip } from './motion';
import { scaleAnnotationLength } from './scale';

export function drawAnnotationBadge(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  layout: { showBadge: boolean },
  contentX: number,
  contentWidth: number,
  y: number,
  displayScale = 1
) {
  if (!layout.showBadge) {
    return { badgeHeight: 0, badgeText: null };
  }

  const badgeText = clip.content.badge?.trim() ? clip.content.badge.trim() : null;
  if (!badgeText) {
    return { badgeHeight: 0, badgeText: null };
  }

  const metrics = resolveAnnotationRenderMetrics(clip.presentation, displayScale);
  const badgeHeight = metrics.textMetrics.badgeHeight;
  const badgeWidth = Math.min(
    contentWidth * 0.38,
    scaleAnnotationLength(48 + badgeText.length * 9, displayScale)
  );
  const centerX = contentX + badgeWidth / 2;
  const centerY = y + badgeHeight / 2;

  runWithMotionState(
    context,
    clip.presentation.effects.badgeProgress,
    centerX,
    centerY,
    { scaleFrom: 0.9, translateY: scaleAnnotationLength(10, displayScale) },
    () => {
      drawRoundedRectPath(context, contentX, y, badgeWidth, badgeHeight, badgeHeight / 2);
      context.fillStyle = clip.presentation.style.accentColor;
      context.fill();
      context.font = `700 ${metrics.textMetrics.badgeFontSize.toFixed(2)}px "Segoe UI"`;
      context.fillStyle = clip.presentation.style.badgeTextColor;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(badgeText, centerX, centerY);
    }
  );

  return { badgeHeight, badgeText };
}

function drawHeadlineText(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  contentX: number,
  contentWidth: number,
  headlineY: number,
  metrics: ResolvedAnnotationRenderMetrics,
  textAlign: 'left' | 'center',
  displayScale: number
) {
  const textX = textAlign === 'center' ? contentX + contentWidth / 2 : contentX;
  const headlineLineHeight = metrics.textMetrics.headlineLineHeight;

  context.textAlign = textAlign;
  context.textBaseline = 'top';
  context.font = `700 ${metrics.textMetrics.headlineFontSize.toFixed(2)}px "Segoe UI"`;
  context.fillStyle = clip.presentation.style.headlineColor;
  const headlineLines = wrapText(context, clip.content.headline, context.font, contentWidth);
  runWithMotionState(
    context,
    clip.presentation.effects.headlineProgress,
    textX,
    headlineY + headlineLineHeight / 2,
    { scaleFrom: 0.97, translateY: scaleAnnotationLength(14, displayScale) },
    () => {
      withRevealClip(
        context,
        clip.presentation.effects.headlineRevealProgress,
        contentX,
        headlineY,
        contentWidth,
        headlineLines.slice(0, 2).length * headlineLineHeight,
        () => {
          headlineLines.slice(0, 2).forEach((line, index) => {
            context.fillText(line, textX, headlineY + index * headlineLineHeight, contentWidth);
          });
        }
      );
    }
  );
  return headlineLines;
}

function drawSublineText(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  contentX: number,
  contentWidth: number,
  headlineY: number,
  headlineLines: string[],
  metrics: ResolvedAnnotationRenderMetrics,
  showSubline: boolean,
  textAlign: 'left' | 'center',
  displayScale: number
) {
  if (!showSubline) {
    return;
  }

  const headlineLineHeight = metrics.textMetrics.headlineLineHeight;
  const sublineLineHeight = metrics.textMetrics.sublineLineHeight;
  const textX = textAlign === 'center' ? contentX + contentWidth / 2 : contentX;
  context.font = `500 ${metrics.textMetrics.sublineFontSize.toFixed(2)}px "Segoe UI"`;
  context.fillStyle = clip.presentation.style.sublineColor;
  const sublineLines = wrapText(context, clip.content.subline, context.font, contentWidth);
  const sublineY =
    headlineY +
    headlineLines.slice(0, 2).length * headlineLineHeight +
    metrics.textMetrics.sublineGap;
  runWithMotionState(
    context,
    clip.presentation.effects.sublineProgress,
    textX,
    sublineY + sublineLineHeight / 2,
    { scaleFrom: 0.98, translateY: scaleAnnotationLength(16, displayScale) },
    () => {
      withRevealClip(
        context,
        clip.presentation.effects.sublineRevealProgress,
        contentX,
        sublineY,
        contentWidth,
        sublineLines.slice(0, 2).length * sublineLineHeight,
        () => {
          sublineLines.slice(0, 2).forEach((line, index) => {
            context.fillText(line, textX, sublineY + index * sublineLineHeight, contentWidth);
          });
        }
      );
    }
  );
}

export function drawAnnotationText(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  contentX: number,
  contentWidth: number,
  headlineY: number,
  showSubline: boolean,
  textAlign: 'left' | 'center',
  displayScale = 1
) {
  const metrics = resolveAnnotationRenderMetrics(clip.presentation, displayScale);
  const headlineLines = drawHeadlineText(
    context,
    clip,
    contentX,
    contentWidth,
    headlineY,
    metrics,
    textAlign,
    displayScale
  );

  drawSublineText(
    context,
    clip,
    contentX,
    contentWidth,
    headlineY,
    headlineLines,
    metrics,
    showSubline,
    textAlign,
    displayScale
  );
}
