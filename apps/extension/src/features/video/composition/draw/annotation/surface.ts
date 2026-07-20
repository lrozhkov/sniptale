import { resolveAnnotationSurfaceProfile } from '../../../project/annotation/surface-profile';
import type { VideoCompositionResolvedAnnotationClip } from '../../types';
import { drawRoundedRectPath, drawRoundedRectSidePath, type RoundedRectPathShape } from '../shared';
import { scaleAnnotationLength } from './scale';

function drawSurfacePath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  shape: RoundedRectPathShape
) {
  drawRoundedRectSidePath(context, x, y, width, height, radius, shape);
}

function createSurfaceGradient(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  axis: 'diagonal' | 'horizontal' | 'vertical'
) {
  switch (axis) {
    case 'diagonal':
      return context.createLinearGradient(x, y, x + width, y + height);
    case 'horizontal':
      return context.createLinearGradient(x, y, x + width, y);
    case 'vertical':
      return context.createLinearGradient(x, y, x, y + height);
  }
}

function drawSurfaceGradient(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  x: number,
  y: number,
  width: number,
  height: number,
  shape: RoundedRectPathShape,
  displayScale: number
) {
  const profile = resolveAnnotationSurfaceProfile(clip.templateKind);
  if (
    profile.gradientAxis === null ||
    profile.gradientStart === null ||
    profile.gradientEnd === null
  ) {
    return;
  }

  const radius = scaleAnnotationLength(clip.presentation.style.borderRadius, displayScale);
  const gradient = createSurfaceGradient(context, x, y, width, height, profile.gradientAxis);
  gradient.addColorStop(0, profile.gradientStart);
  gradient.addColorStop(1, profile.gradientEnd);
  drawSurfacePath(context, x, y, width, height, radius, shape);
  context.fillStyle = gradient;
  context.fill();
}

function drawSurfaceHighlight(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  x: number,
  y: number,
  width: number,
  height: number,
  shape: RoundedRectPathShape,
  displayScale: number
) {
  const profile = resolveAnnotationSurfaceProfile(clip.templateKind);
  if (profile.highlightAlpha <= 0) {
    return;
  }

  const radius = scaleAnnotationLength(clip.presentation.style.borderRadius, displayScale);
  const gradient = context.createLinearGradient(x, y, x, y + height * 0.45);
  gradient.addColorStop(0, `rgba(255,255,255,${profile.highlightAlpha.toFixed(2)})`);
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  drawSurfacePath(context, x, y, width, height, radius, shape);
  context.fillStyle = gradient;
  context.fill();
}

function getBackgroundPanelRect(
  x: number,
  width: number,
  accentWidth: number
): { panelWidth: number; panelX: number } {
  const overlapInset = Math.max(0, accentWidth - 1);
  return {
    panelWidth: Math.max(1, width - overlapInset),
    panelX: x + overlapInset,
  };
}

function drawAnnotationShadow(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  x: number,
  y: number,
  width: number,
  height: number,
  displayScale: number
) {
  const shadowAlpha =
    clip.presentation.style.depthAmount * clip.presentation.effects.shadowStrength;
  const shadowOffset = Math.max(
    scaleAnnotationLength(4, displayScale),
    scaleAnnotationLength(clip.presentation.style.padding * 0.22, displayScale)
  );
  const borderRadius = scaleAnnotationLength(clip.presentation.style.borderRadius, displayScale);

  drawRoundedRectPath(context, x, y + shadowOffset, width, height, borderRadius);
  context.fillStyle = `rgba(0,0,0,${(shadowAlpha * 0.42).toFixed(2)})`;
  context.fill();
}

function drawAnnotationPanel(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  x: number,
  y: number,
  width: number,
  height: number,
  accentWidth: number,
  displayScale: number
) {
  const panelRect =
    accentWidth > 0
      ? getBackgroundPanelRect(x, width, accentWidth)
      : { panelWidth: width, panelX: x };
  const shape = accentWidth > 0 ? 'right' : 'full';
  const borderRadius = scaleAnnotationLength(clip.presentation.style.borderRadius, displayScale);

  drawSurfacePath(context, panelRect.panelX, y, panelRect.panelWidth, height, borderRadius, shape);
  context.fillStyle = clip.presentation.style.backgroundColor;
  context.fill();
  drawSurfaceGradient(
    context,
    clip,
    panelRect.panelX,
    y,
    panelRect.panelWidth,
    height,
    shape,
    displayScale
  );
  drawSurfaceHighlight(
    context,
    clip,
    panelRect.panelX,
    y,
    panelRect.panelWidth,
    height,
    shape,
    displayScale
  );
}

export function multiplyCanvasAlpha(context: CanvasRenderingContext2D, multiplier: number) {
  const baseAlpha = typeof context.globalAlpha === 'number' ? context.globalAlpha : 1;
  context.globalAlpha = baseAlpha * multiplier;
}

export function drawAccentRailPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  drawSurfacePath(context, x, y, width, height, radius, 'left');
}

export function drawAnnotationBackground(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  x: number,
  y: number,
  width: number,
  height: number,
  accentWidth = 0,
  displayScale = 1
) {
  drawAnnotationShadow(context, clip, x, y, width, height, displayScale);
  drawAnnotationPanel(context, clip, x, y, width, height, accentWidth, displayScale);
}
