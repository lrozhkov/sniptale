import { resolveAnnotationSurfaceProfile } from '../../../project/annotation/surface-profile';
import type { VideoCompositionResolvedAnnotationClip } from '../../types';
import { drawRoundedRectPath } from '../shared';
import { runWithMotionState } from './motion';
import { drawAccentRailPath, multiplyCanvasAlpha } from './surface';
import { scaleAnnotationLength } from './scale';

function drawSurfaceBorder(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  x: number,
  y: number,
  width: number,
  height: number,
  displayScale: number
) {
  const profile = resolveAnnotationSurfaceProfile(clip.templateKind);
  if (profile.borderAlpha <= 0) {
    return;
  }

  context.save();
  multiplyCanvasAlpha(context, profile.borderAlpha);
  context.lineWidth = scaleAnnotationLength(1.5, displayScale);
  drawRoundedRectPath(
    context,
    x,
    y,
    width,
    height,
    scaleAnnotationLength(clip.presentation.style.borderRadius, displayScale)
  );
  context.strokeStyle = '#ffffff';
  context.stroke();
  context.restore();
}

function getResolvedAccentWidth(clip: VideoCompositionResolvedAnnotationClip, accentWidth: number) {
  return Math.max(2, accentWidth * clip.presentation.effects.accentWidthMultiplier);
}

function drawAccentShape(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  x: number,
  y: number,
  width: number,
  height: number,
  displayScale: number
) {
  drawAccentRailPath(
    context,
    x,
    y,
    width,
    height,
    Math.min(scaleAnnotationLength(clip.presentation.style.borderRadius, displayScale), width)
  );
}

function drawAccentGlow(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  x: number,
  y: number,
  height: number,
  resolvedAccentWidth: number,
  displayScale: number
) {
  const profile = resolveAnnotationSurfaceProfile(clip.templateKind);
  if (profile.accentGlowAlpha <= 0) {
    return;
  }

  runWithMotionState(
    context,
    clip.presentation.effects.accentProgress,
    x + resolvedAccentWidth / 2,
    y + height / 2,
    { scaleFrom: 0.82, translateX: -scaleAnnotationLength(18, displayScale), translateY: 0 },
    () => {
      drawAccentShape(
        context,
        clip,
        x - resolvedAccentWidth * 0.18,
        y,
        resolvedAccentWidth * 1.36,
        height,
        displayScale
      );
      context.save();
      multiplyCanvasAlpha(context, profile.accentGlowAlpha);
      context.fillStyle = clip.presentation.style.accentColor;
      context.fill();
      context.restore();
    }
  );
}

function drawAccentFill(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  x: number,
  y: number,
  height: number,
  resolvedAccentWidth: number,
  displayScale: number
) {
  runWithMotionState(
    context,
    clip.presentation.effects.accentProgress,
    x + resolvedAccentWidth / 2,
    y + height / 2,
    { scaleFrom: 0.84, translateX: -scaleAnnotationLength(18, displayScale), translateY: 0 },
    () => {
      drawAccentShape(context, clip, x, y, resolvedAccentWidth, height, displayScale);
      context.fillStyle = clip.presentation.style.accentColor;
      context.fill();
    }
  );
}

export function drawAnnotationBorder(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  x: number,
  y: number,
  width: number,
  height: number,
  displayScale = 1
) {
  drawSurfaceBorder(context, clip, x, y, width, height, displayScale);
}

export function drawAccentRail(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  x: number,
  y: number,
  accentWidth: number,
  height: number,
  displayScale = 1
) {
  const resolvedAccentWidth = getResolvedAccentWidth(clip, accentWidth);
  drawAccentGlow(context, clip, x, y, height, resolvedAccentWidth, displayScale);
  drawAccentFill(context, clip, x, y, height, resolvedAccentWidth, displayScale);
}

export function drawTitleDivider(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  x: number,
  y: number,
  width: number,
  displayScale = 1
) {
  runWithMotionState(
    context,
    clip.presentation.effects.accentProgress,
    x + width / 2,
    y + scaleAnnotationLength(1, displayScale),
    { scaleFrom: 0.86, translateY: 0 },
    () => {
      context.fillStyle = clip.presentation.style.accentColor;
      context.fillRect(x + width * 0.29, y, width * 0.42, scaleAnnotationLength(2, displayScale));
    }
  );
}
