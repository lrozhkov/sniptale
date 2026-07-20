import { clamp } from '../../document/model';
import { getEditorViewportMetrics } from './metrics';
import { applyEditorViewportZoom } from './zoom';
import { getDevicePixelRatioBaselineOptions, type ZoomContext } from './actions-types';

type ViewportPoint = { clientX: number; clientY: number };
type LocalViewportPoint = { x: number; y: number };

function readLocalViewportPoint(
  viewportElement: HTMLElement,
  metrics: ReturnType<typeof getEditorViewportMetrics>,
  point: ViewportPoint
): LocalViewportPoint {
  const viewportRect = viewportElement.getBoundingClientRect();

  return {
    x: (point.clientX - viewportRect.left) / metrics.domScaleCompensation,
    y: (point.clientY - viewportRect.top) / metrics.domScaleCompensation,
  };
}

function capturePointAnchor(args: {
  metrics: ReturnType<typeof getEditorViewportMetrics>;
  point: LocalViewportPoint;
}) {
  return {
    relativeX: clamp(
      (args.metrics.scrollLeft + args.point.x - args.metrics.canvasOffsetLeft) /
        args.metrics.scaledCanvasWidth,
      0,
      1
    ),
    relativeY: clamp(
      (args.metrics.scrollTop + args.point.y - args.metrics.canvasOffsetTop) /
        args.metrics.scaledCanvasHeight,
      0,
      1
    ),
  };
}

function restorePointAnchor(args: {
  context: ZoomContext;
  localPoint: LocalViewportPoint;
  nextZoomLevel: number;
  relativeX: number;
  relativeY: number;
}) {
  const { canvasDocumentSize, devicePixelRatioBaseline, stageElement, viewportElement } =
    args.context;
  if (!viewportElement) {
    return;
  }

  const metricsAfter = getEditorViewportMetrics({
    viewportElement,
    stageElement,
    canvasDocumentSize,
    zoomLevel: args.nextZoomLevel,
    ...getDevicePixelRatioBaselineOptions(devicePixelRatioBaseline),
  });
  viewportElement.scrollLeft =
    Math.max(
      0,
      args.relativeX * metricsAfter.scaledCanvasWidth +
        metricsAfter.canvasOffsetLeft -
        args.localPoint.x
    ) * metricsAfter.domScaleCompensation;
  viewportElement.scrollTop =
    Math.max(
      0,
      args.relativeY * metricsAfter.scaledCanvasHeight +
        metricsAfter.canvasOffsetTop -
        args.localPoint.y
    ) * metricsAfter.domScaleCompensation;
  args.context.syncViewportState();
}

export function setEditorZoomAtViewportPoint(
  context: ZoomContext,
  value: number,
  point: ViewportPoint
): number {
  const { canvas, viewportElement, stageElement, canvasDocumentSize, zoomLevel } = context;
  if (!canvas || !viewportElement) {
    return zoomLevel;
  }

  const metricsBefore = getEditorViewportMetrics({
    viewportElement,
    stageElement,
    canvasDocumentSize,
    zoomLevel,
    ...getDevicePixelRatioBaselineOptions(context.devicePixelRatioBaseline),
  });
  if (metricsBefore.scaledCanvasWidth <= 0 || metricsBefore.scaledCanvasHeight <= 0) {
    return zoomLevel;
  }

  const localPoint = readLocalViewportPoint(viewportElement, metricsBefore, point);
  const anchor = capturePointAnchor({ metrics: metricsBefore, point: localPoint });
  const nextZoomLevel = clamp(value, 0.2, 4);

  applyEditorViewportZoom(
    canvas,
    canvasDocumentSize,
    nextZoomLevel,
    context.devicePixelRatioBaseline
  );
  requestAnimationFrame(() =>
    restorePointAnchor({ context, localPoint, nextZoomLevel, ...anchor })
  );
  canvas.requestRenderAll();
  context.syncRuntimeState();
  return nextZoomLevel;
}
