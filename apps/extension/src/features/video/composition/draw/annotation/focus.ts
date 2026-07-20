import { resolveAnnotationRenderMetrics } from '../../../project/annotation/render-metrics';
import type { VideoCompositionResolvedAnnotationClip } from '../../types';
import { drawAnnotationBorder } from './decorations';
import { drawAnnotationText } from './parts';
import { drawAnnotationBackground } from './surface';
import { drawLeaderLine } from './target-primitives';
import { scaleTargetAwareAnnotationClip } from './target-scale';

function traceRoundedRect(
  context: CanvasRenderingContext2D,
  rect: { height: number; width: number; x: number; y: number },
  radius: number
) {
  const clampedRadius = Math.max(0, Math.min(radius, rect.width / 2, rect.height / 2));
  context.beginPath();
  context.moveTo(rect.x + clampedRadius, rect.y);
  context.lineTo(rect.x + rect.width - clampedRadius, rect.y);
  context.quadraticCurveTo(
    rect.x + rect.width,
    rect.y,
    rect.x + rect.width,
    rect.y + clampedRadius
  );
  context.lineTo(rect.x + rect.width, rect.y + rect.height - clampedRadius);
  context.quadraticCurveTo(
    rect.x + rect.width,
    rect.y + rect.height,
    rect.x + rect.width - clampedRadius,
    rect.y + rect.height
  );
  context.lineTo(rect.x + clampedRadius, rect.y + rect.height);
  context.quadraticCurveTo(
    rect.x,
    rect.y + rect.height,
    rect.x,
    rect.y + rect.height - clampedRadius
  );
  context.lineTo(rect.x, rect.y + clampedRadius);
  context.quadraticCurveTo(rect.x, rect.y, rect.x + clampedRadius, rect.y);
}

function traceBracketRect(
  context: CanvasRenderingContext2D,
  rect: { height: number; width: number; x: number; y: number },
  progress: number
) {
  const reveal = Math.max(0.2, Math.min(1, progress));
  const cornerLength = Math.min(rect.width, rect.height) * (0.16 + reveal * 0.08);
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;

  context.beginPath();
  context.moveTo(left, top + cornerLength);
  context.lineTo(left, top);
  context.lineTo(left + cornerLength, top);

  context.moveTo(right - cornerLength, top);
  context.lineTo(right, top);
  context.lineTo(right, top + cornerLength);

  context.moveTo(right, bottom - cornerLength);
  context.lineTo(right, bottom);
  context.lineTo(right - cornerLength, bottom);

  context.moveTo(left + cornerLength, bottom);
  context.lineTo(left, bottom);
  context.lineTo(left, bottom - cornerLength);
}

function drawFrameStroke(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  rect: { height: number; width: number; x: number; y: number },
  frameProgress: number,
  metrics: ReturnType<typeof resolveAnnotationRenderMetrics>
) {
  context.save();
  context.globalAlpha *= frameProgress;
  context.strokeStyle = clip.presentation.style.accentColor;
  context.lineWidth = metrics.targetMetrics.frameStrokeWidth;

  if (clip.calloutDecor.frameKind === 'BRACKET') {
    traceBracketRect(context, rect, frameProgress);
  } else {
    traceRoundedRect(context, rect, metrics.targetMetrics.frameCornerRadius);
  }

  context.stroke();
  context.restore();
}

function drawRectFocus(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  rect: NonNullable<VideoCompositionResolvedAnnotationClip['targetRect']>,
  displayScale: number
) {
  const metrics = resolveAnnotationRenderMetrics(clip.presentation, displayScale);
  const frameProgress = Math.max(
    clip.presentation.effects.connectorProgress,
    clip.presentation.effects.markerProgress
  );
  const pulseScale = clip.presentation.effects.scaleMultiplier;
  const pulseGap = metrics.targetMetrics.pulseGap * pulseScale;
  const pulseRect = {
    height: rect.height + pulseGap * 2,
    width: rect.width + pulseGap * 2,
    x: rect.x - pulseGap,
    y: rect.y - pulseGap,
  };

  if (clip.calloutDecor.pulseKind !== 'NONE') {
    context.save();
    context.globalAlpha *= 0.18 * clip.presentation.effects.shadowStrength;
    context.strokeStyle = clip.presentation.style.accentColor;
    context.lineWidth = metrics.targetMetrics.pulseStrokeWidth;
    traceRoundedRect(context, pulseRect, metrics.targetMetrics.frameCornerRadius + pulseGap * 0.45);
    context.stroke();
    context.restore();
  }

  if (clip.calloutDecor.frameKind === 'NONE') {
    return;
  }

  drawFrameStroke(context, clip, rect, frameProgress, metrics);
}

function drawPointFocus(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  point: NonNullable<VideoCompositionResolvedAnnotationClip['targetPoint']>,
  displayScale: number
) {
  if (clip.calloutDecor.pulseKind === 'NONE') {
    return;
  }

  const metrics = resolveAnnotationRenderMetrics(clip.presentation, displayScale);
  const radius = metrics.targetMetrics.ringOuterRadius * clip.presentation.effects.scaleMultiplier;

  context.save();
  context.globalAlpha *= 0.2 * clip.presentation.effects.shadowStrength;
  context.strokeStyle = clip.presentation.style.accentColor;
  context.lineWidth = metrics.targetMetrics.pulseStrokeWidth;
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

export function drawTargetFrameDecorations(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  displayScale: number
) {
  const scaledClip = scaleTargetAwareAnnotationClip(clip, displayScale);
  if (scaledClip.targetRect !== null) {
    drawRectFocus(context, scaledClip, scaledClip.targetRect, displayScale);
  }

  if (scaledClip.targetPoint !== null) {
    drawPointFocus(context, scaledClip, scaledClip.targetPoint, displayScale);
  }
}

export function drawFrameAnnotation(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  displayScale = 1
) {
  const scaledClip = scaleTargetAwareAnnotationClip(clip, displayScale);
  const metrics = resolveAnnotationRenderMetrics(clip.presentation, displayScale);
  const scaledPadding = metrics.surfaceMetrics.padding;

  drawTargetFrameDecorations(context, clip, displayScale);
  drawLeaderLine(context, scaledClip, displayScale);
  drawAnnotationBackground(
    context,
    scaledClip,
    scaledClip.presentation.labelFrame.x,
    scaledClip.presentation.labelFrame.y,
    scaledClip.presentation.labelFrame.width,
    scaledClip.presentation.labelFrame.height,
    0,
    displayScale
  );
  drawAnnotationBorder(
    context,
    scaledClip,
    scaledClip.presentation.labelFrame.x,
    scaledClip.presentation.labelFrame.y,
    scaledClip.presentation.labelFrame.width,
    scaledClip.presentation.labelFrame.height,
    displayScale
  );
  drawAnnotationText(
    context,
    scaledClip,
    scaledClip.presentation.labelFrame.x + scaledPadding,
    scaledClip.presentation.labelFrame.width - scaledPadding * 2,
    scaledClip.presentation.labelFrame.y + scaledPadding,
    true,
    'left',
    displayScale
  );
}
