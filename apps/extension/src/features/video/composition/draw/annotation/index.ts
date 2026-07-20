import {
  VideoAnnotationLayoutFamily,
  resolveAnnotationLayoutFeatures,
} from '../../../project/annotation/layout';
import { resolveAnnotationSweepProfile } from '../../../project/annotation/sweep-profile';
import type { VideoCompositionResolvedAnnotationClip } from '../../types';
import { drawAnnotationBadge, drawAnnotationText } from './parts';
import { drawSweepOverlay } from './motion';
import { drawAnnotationBackground } from './surface';
import { drawFrameAnnotation, drawTargetFrameDecorations } from './focus';
import { drawConnectorAnnotation, drawMarkerAnnotation } from './targets';
import { drawAccentRail, drawAnnotationBorder, drawTitleDivider } from './decorations';
import { scaleAnnotationLength } from './scale';
import { drawResolvedAnnotationScene } from './scene';

function applyAnnotationContainerTransform(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  x: number,
  y: number,
  scaleMultiplier: number
) {
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  context.translate(centerX, centerY);
  context.scale(scaleMultiplier, scaleMultiplier);
  context.translate(-centerX, -centerY);
}

function drawAnnotationSweepLayers(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  x: number,
  y: number,
  width: number,
  height: number
) {
  if (clip.presentation.effects.shimmerProgress !== null) {
    const shimmerProfile = resolveAnnotationSweepProfile(clip.templateKind, 'shimmer');
    drawSweepOverlay(
      context,
      width,
      height,
      x,
      y,
      clip.presentation.effects.shimmerProgress,
      clip.presentation.style.shimmerAmount,
      shimmerProfile
    );
  }

  if (clip.presentation.effects.glossProgress !== null) {
    drawSweepOverlay(
      context,
      width,
      height,
      x,
      y,
      clip.presentation.effects.glossProgress,
      1,
      resolveAnnotationSweepProfile(clip.templateKind, 'gloss')
    );
  }
}

function drawTargetAwareAnnotation(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  layoutFamily: ReturnType<typeof resolveAnnotationLayoutFeatures>['family'],
  displayScale: number
) {
  if (layoutFamily === VideoAnnotationLayoutFamily.CONNECTOR) {
    drawTargetFrameDecorations(context, clip, displayScale);
    drawConnectorAnnotation(context, clip, displayScale);
    return true;
  }

  if (layoutFamily === VideoAnnotationLayoutFamily.FRAME) {
    drawFrameAnnotation(context, clip, displayScale);
    return true;
  }

  if (layoutFamily === VideoAnnotationLayoutFamily.MARKER) {
    drawMarkerAnnotation(context, clip, displayScale);
    return true;
  }

  return false;
}

function drawPlateAnnotation(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  layout: ReturnType<typeof resolveAnnotationLayoutFeatures>,
  x: number,
  y: number,
  width: number,
  height: number,
  displayScale: number
) {
  const { style } = clip.presentation;
  const accentWidth = layout.showAccentRail
    ? Math.max(scaleAnnotationLength(10, displayScale), width * 0.018)
    : 0;
  const { contentWidth, contentX, scaledPadding } = getPlateContentFrame(
    style.padding,
    x,
    width,
    accentWidth,
    displayScale
  );

  drawAnnotationBackground(context, clip, x, y, width, height, accentWidth, displayScale);
  if (layout.showAccentRail) {
    drawAccentRail(context, clip, x, y, accentWidth, height, displayScale);
  }
  drawAnnotationBorder(context, clip, x, y, width, height, displayScale);
  drawPlateAnnotationContent(
    context,
    clip,
    layout,
    contentX,
    contentWidth,
    scaledPadding,
    y,
    height,
    width,
    x,
    displayScale
  );
  drawAnnotationSweepLayers(context, clip, x, y, width, height);
}

function getPlateContentFrame(
  padding: number,
  x: number,
  width: number,
  accentWidth: number,
  displayScale: number
) {
  const scaledPadding = scaleAnnotationLength(padding, displayScale);
  return {
    contentWidth: Math.max(
      scaleAnnotationLength(24, displayScale),
      width - scaledPadding * 2 - accentWidth
    ),
    contentX: x + scaledPadding + accentWidth,
    scaledPadding,
  };
}

function drawPlateAnnotationContent(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  layout: ReturnType<typeof resolveAnnotationLayoutFeatures>,
  contentX: number,
  contentWidth: number,
  scaledPadding: number,
  y: number,
  height: number,
  width: number,
  x: number,
  displayScale: number
) {
  const badgeY = y + scaledPadding;
  const badge = drawAnnotationBadge(
    context,
    clip,
    layout,
    contentX,
    contentWidth,
    badgeY,
    displayScale
  );
  const titleOffset =
    layout.family === VideoAnnotationLayoutFamily.TITLE_STACK
      ? scaleAnnotationLength(10, displayScale)
      : 0;
  const headlineY =
    y +
    scaledPadding +
    titleOffset +
    (badge.badgeText ? badge.badgeHeight + scaleAnnotationLength(10, displayScale) : 0);

  drawAnnotationText(
    context,
    clip,
    contentX,
    contentWidth,
    headlineY,
    layout.showSubline,
    layout.textAlign,
    displayScale
  );
  if (layout.showDivider) {
    drawTitleDivider(context, clip, x, headlineY + height * 0.18, width, displayScale);
  }
}

export function drawAnnotationCompositionLayer(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  x: number,
  y: number,
  width: number,
  height: number,
  displayScale = 1
): void {
  if (clip.scene) {
    drawResolvedAnnotationScene({
      context,
      displayScale,
      scene: clip.scene,
      viewport: { height, width, x, y },
    });
    return;
  }

  const layout = resolveAnnotationLayoutFeatures(clip.templateKind);
  const { effects } = clip.presentation;
  const visibleWidth = Math.max(1, width * effects.maskProgress);

  context.save();
  context.beginPath();
  context.rect(x, y, visibleWidth, height);
  context.clip();
  if (effects.blurPx > 0) {
    context.filter = `blur(${effects.blurPx.toFixed(2)}px)`;
  }

  applyAnnotationContainerTransform(context, width, height, x, y, effects.scaleMultiplier);

  if (drawTargetAwareAnnotation(context, clip, layout.family, displayScale)) {
    context.restore();
    return;
  }

  drawPlateAnnotation(context, clip, layout, x, y, width, height, displayScale);
  context.restore();
}
