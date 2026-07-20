import { clamp } from '../../../document/model';
import { applyEditorViewportZoom, getEditorViewportFitArea, getEditorViewportMetrics } from '..';
import { getDevicePixelRatioBaselineOptions, type ZoomContext } from '../actions-types';

export function zoomEditorToFit(context: ZoomContext): number {
  const {
    canvas,
    viewportElement,
    stageElement,
    canvasDocumentSize,
    devicePixelRatioBaseline,
    syncViewportState,
    syncRuntimeState,
  } = context;
  if (!canvas || !viewportElement) {
    return context.zoomLevel;
  }

  const baseWidth = canvasDocumentSize.width;
  const baseHeight = canvasDocumentSize.height;
  if (baseWidth <= 0 || baseHeight <= 0) {
    return context.zoomLevel;
  }

  const fitArea = getEditorViewportFitArea(viewportElement, devicePixelRatioBaseline);
  const nextZoom = Math.min(fitArea.width / baseWidth, fitArea.height / baseHeight, 1);
  const zoomLevel = Math.round(clamp(nextZoom, 0.2, 4) * 1000) / 1000;

  applyEditorViewportZoom(canvas, canvasDocumentSize, zoomLevel, devicePixelRatioBaseline);
  requestAnimationFrame(() => {
    const viewport = getEditorViewportMetrics({
      viewportElement,
      stageElement,
      canvasDocumentSize,
      zoomLevel,
      ...getDevicePixelRatioBaselineOptions(devicePixelRatioBaseline),
    });
    viewportElement.scrollLeft =
      Math.max(0, viewport.scaledCanvasWidth / 2 + viewport.canvasOffsetLeft - fitArea.centerX) *
      viewport.domScaleCompensation;
    viewportElement.scrollTop =
      Math.max(0, viewport.scaledCanvasHeight / 2 + viewport.canvasOffsetTop - fitArea.centerY) *
      viewport.domScaleCompensation;
    syncViewportState();
  });
  canvas.requestRenderAll();
  syncRuntimeState();
  return zoomLevel;
}
