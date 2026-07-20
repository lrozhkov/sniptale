import { clamp } from '../../document/model';
import { getEditorViewportMetrics } from './';
import { getDevicePixelRatioBaselineOptions, type CanvasSize } from './actions-types';

interface NavigateEditorViewportOptions {
  viewportElement: HTMLElement | null;
  stageElement: HTMLElement | null;
  canvasDocumentSize: CanvasSize;
  zoomLevel: number;
  relativeX: number;
  relativeY: number;
  devicePixelRatioBaseline?: number;
  syncViewportState: () => void;
}

function resolveViewportScrollOffset(args: {
  canvasOffset: number;
  domScaleCompensation: number;
  relativePosition: number;
  scaledCanvasSize: number;
  viewportSize: number;
}) {
  return (
    Math.max(
      0,
      clamp(args.relativePosition, 0, 1) * args.scaledCanvasSize +
        args.canvasOffset -
        args.viewportSize / 2
    ) * args.domScaleCompensation
  );
}

export function navigateEditorViewportTo(options: NavigateEditorViewportOptions): void {
  const {
    viewportElement,
    stageElement,
    canvasDocumentSize,
    zoomLevel,
    relativeX,
    relativeY,
    devicePixelRatioBaseline,
    syncViewportState,
  } = options;
  if (!viewportElement) {
    return;
  }

  const metrics = getEditorViewportMetrics({
    viewportElement,
    stageElement,
    canvasDocumentSize,
    zoomLevel,
    ...getDevicePixelRatioBaselineOptions(devicePixelRatioBaseline),
  });
  if (metrics.scaledCanvasWidth <= 0 || metrics.scaledCanvasHeight <= 0) {
    return;
  }

  viewportElement.scrollLeft = resolveViewportScrollOffset({
    canvasOffset: metrics.canvasOffsetLeft,
    domScaleCompensation: metrics.domScaleCompensation,
    relativePosition: relativeX,
    scaledCanvasSize: metrics.scaledCanvasWidth,
    viewportSize: metrics.viewportWidth,
  });
  viewportElement.scrollTop = resolveViewportScrollOffset({
    canvasOffset: metrics.canvasOffsetTop,
    domScaleCompensation: metrics.domScaleCompensation,
    relativePosition: relativeY,
    scaledCanvasSize: metrics.scaledCanvasHeight,
    viewportSize: metrics.viewportHeight,
  });
  syncViewportState();
}
