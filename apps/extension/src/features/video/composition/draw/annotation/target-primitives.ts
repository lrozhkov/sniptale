import { resolveAnnotationConnectorGeometry } from '../../../project/annotation/target-geometry';
import { resolveAnnotationRenderMetrics } from '../../../project/annotation/render-metrics';
import type {
  VideoProjectAnnotationCalloutDecor,
  VideoProjectAnnotationLeaderLine,
} from '../../../project/types/layout';
import type { VideoCompositionResolvedAnnotationClip } from '../../types';
import { scaleAnnotationLength } from './scale';

function drawPolyline(context: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>) {
  if (points.length === 0) {
    return;
  }

  context.beginPath();
  context.moveTo(points[0]!.x, points[0]!.y);
  for (const point of points.slice(1)) {
    context.lineTo(point.x, point.y);
  }
}

function drawTargetMarker(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  point: { x: number; y: number },
  displayScale: number
) {
  const calloutDecor: VideoProjectAnnotationCalloutDecor = clip.calloutDecor;
  const metrics = resolveAnnotationRenderMetrics(clip.presentation, displayScale);
  const scale = 0.84 + clip.presentation.effects.markerProgress * 0.16;

  context.save();
  context.translate(point.x, point.y);
  context.scale(scale, scale);
  context.globalAlpha *= clip.presentation.effects.markerProgress;

  if (calloutDecor.markerKind === 'DOT') {
    context.beginPath();
    context.arc(0, 0, metrics.targetMetrics.dotRadius, 0, Math.PI * 2);
    context.fillStyle = clip.presentation.style.accentColor;
    context.fill();
    context.lineWidth = metrics.targetMetrics.dotStrokeWidth;
    context.strokeStyle = '#ffffff';
    context.stroke();
  }

  if (calloutDecor.markerKind === 'RING') {
    context.beginPath();
    context.arc(0, 0, metrics.targetMetrics.ringOuterRadius, 0, Math.PI * 2);
    context.lineWidth = metrics.targetMetrics.ringStrokeWidth;
    context.strokeStyle = clip.presentation.style.accentColor;
    context.stroke();

    context.beginPath();
    context.arc(0, 0, metrics.targetMetrics.ringInnerRadius, 0, Math.PI * 2);
    context.fillStyle = clip.presentation.style.accentColor;
    context.fill();
  }

  context.restore();
}

function drawLeaderStroke(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  displayScale: number,
  drawPath: () => void
) {
  const leaderLine: VideoProjectAnnotationLeaderLine = clip.leaderLine;
  context.save();
  context.strokeStyle = clip.presentation.style.accentColor;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = scaleAnnotationLength(leaderLine.thickness, displayScale);
  context.globalAlpha *= clip.presentation.effects.connectorProgress;
  drawPath();
  context.stroke();
  context.restore();
}

function drawChevronArrow(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  sourcePoint: { x: number; y: number },
  labelPoint: { x: number; y: number },
  displayScale: number
) {
  const calloutDecor: VideoProjectAnnotationCalloutDecor = clip.calloutDecor;
  const metrics = resolveAnnotationRenderMetrics(clip.presentation, displayScale);
  if (calloutDecor.arrowKind !== 'CHEVRON') {
    return;
  }

  const deltaX = labelPoint.x - sourcePoint.x;
  const deltaY = labelPoint.y - sourcePoint.y;
  const length = Math.hypot(deltaX, deltaY);
  if (length <= 0.001) {
    return;
  }

  const unitX = deltaX / length;
  const unitY = deltaY / length;
  const size = metrics.targetMetrics.chevronSize;
  const wingA = {
    x: labelPoint.x - unitX * size + unitY * size * 0.45,
    y: labelPoint.y - unitY * size - unitX * size * 0.45,
  };
  const wingB = {
    x: labelPoint.x - unitX * size - unitY * size * 0.45,
    y: labelPoint.y - unitY * size + unitX * size * 0.45,
  };

  drawLeaderStroke(context, clip, displayScale, () => {
    drawPolyline(context, [wingA, labelPoint, wingB]);
  });
}

export function drawLeaderLine(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  displayScale: number
) {
  const geometry = resolveAnnotationConnectorGeometry(clip, clip.presentation.labelFrame);
  if (geometry.targetAnchorPoint === null) {
    return;
  }

  const points = [geometry.targetAnchorPoint, geometry.bendPoint, geometry.labelAttachPoint].filter(
    (point): point is { x: number; y: number } => point !== null
  );

  drawLeaderStroke(context, clip, displayScale, () => {
    drawPolyline(context, points);
  });

  drawChevronArrow(
    context,
    clip,
    geometry.bendPoint ?? geometry.targetAnchorPoint,
    geometry.labelAttachPoint,
    displayScale
  );
  drawTargetMarker(context, clip, geometry.targetAnchorPoint, displayScale);
}
