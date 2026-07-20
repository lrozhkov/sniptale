import { resolveAnnotationRenderMetrics } from '../../../project/annotation/render-metrics';
import type { VideoCompositionResolvedAnnotationClip } from '../../types';
import { drawAnnotationBorder } from './decorations';
import { drawAnnotationText } from './parts';
import { runWithMotionState, withRevealClip } from './motion';
import { drawAnnotationBackground } from './surface';
import { drawLeaderLine } from './target-primitives';
import { scaleAnnotationLength } from './scale';
import { scaleTargetAwareAnnotationClip } from './target-scale';

function drawConnectorLabelShell(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  displayScale: number
) {
  const { height, width, x, y } = clip.presentation.labelFrame;
  drawAnnotationBackground(context, clip, x, y, width, height, 0, displayScale);
  drawAnnotationBorder(context, clip, x, y, width, height, displayScale);
}

function prepareTargetAnnotationShell(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  displayScale: number
) {
  const scaledClip = scaleTargetAwareAnnotationClip(clip, displayScale);
  const metrics = resolveAnnotationRenderMetrics(clip.presentation, displayScale);

  drawLeaderLine(context, scaledClip, displayScale);
  drawConnectorLabelShell(context, scaledClip, displayScale);

  return {
    metrics,
    scaledClip,
    scaledPadding: metrics.surfaceMetrics.padding,
  };
}

export function drawConnectorAnnotation(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  displayScale = 1
) {
  const { scaledClip, scaledPadding } = prepareTargetAnnotationShell(context, clip, displayScale);
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

export function drawMarkerAnnotation(
  context: CanvasRenderingContext2D,
  clip: VideoCompositionResolvedAnnotationClip,
  displayScale = 1
) {
  const { metrics, scaledClip, scaledPadding } = prepareTargetAnnotationShell(
    context,
    clip,
    displayScale
  );

  const contentX = scaledClip.presentation.labelFrame.x + scaledPadding;
  const contentY =
    scaledClip.presentation.labelFrame.y +
    scaledClip.presentation.labelFrame.height / 2 -
    scaleAnnotationLength(10, displayScale);
  const contentWidth = scaledClip.presentation.labelFrame.width - scaledPadding * 2;

  runWithMotionState(
    context,
    scaledClip.presentation.effects.headlineProgress,
    contentX,
    contentY,
    { scaleFrom: 0.95, translateY: scaleAnnotationLength(8, displayScale) },
    () => {
      withRevealClip(
        context,
        scaledClip.presentation.effects.headlineRevealProgress,
        contentX,
        scaledClip.presentation.labelFrame.y + scaleAnnotationLength(8, displayScale),
        contentWidth,
        scaledClip.presentation.labelFrame.height - scaleAnnotationLength(16, displayScale),
        () => {
          context.fillStyle = scaledClip.presentation.style.headlineColor;
          context.font = `700 ${metrics.textMetrics.markerHeadlineFontSize.toFixed(2)}px "Segoe UI"`;
          context.textAlign = 'left';
          context.textBaseline = 'middle';
          context.fillText(scaledClip.content.headline, contentX, contentY, contentWidth);
        }
      );
    }
  );
}
