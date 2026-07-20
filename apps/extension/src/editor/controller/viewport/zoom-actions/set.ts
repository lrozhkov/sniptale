import { clamp } from '../../../document/model';
import {
  applyEditorViewportZoom,
  captureEditorViewportAnchor,
  restoreEditorViewportAnchor,
} from '..';
import { getDevicePixelRatioBaselineOptions, type ZoomContext } from '../actions-types';

export function setEditorZoom(context: ZoomContext, value: number): number {
  const {
    canvas,
    viewportElement,
    stageElement,
    canvasDocumentSize,
    zoomLevel,
    devicePixelRatioBaseline,
    syncViewportState,
    syncRuntimeState,
  } = context;
  if (!canvas) {
    return zoomLevel;
  }

  const anchor = captureEditorViewportAnchor({
    canvas,
    viewportElement,
    stageElement,
    canvasDocumentSize,
    zoomLevel,
    ...getDevicePixelRatioBaselineOptions(devicePixelRatioBaseline),
  });
  const nextZoomLevel = clamp(value, 0.2, 4);
  applyEditorViewportZoom(canvas, canvasDocumentSize, nextZoomLevel, devicePixelRatioBaseline);
  restoreEditorViewportAnchor({
    canvas,
    viewportElement,
    stageElement,
    canvasDocumentSize,
    zoomLevel: nextZoomLevel,
    anchor,
    onSynced: syncViewportState,
    ...getDevicePixelRatioBaselineOptions(devicePixelRatioBaseline),
  });
  canvas.requestRenderAll();
  syncRuntimeState();
  return nextZoomLevel;
}

export function setEditorZoomCentered(context: ZoomContext, value: number): number {
  const {
    canvas,
    viewportElement,
    stageElement,
    canvasDocumentSize,
    zoomLevel,
    devicePixelRatioBaseline,
    syncViewportState,
    syncRuntimeState,
  } = context;
  if (!canvas) {
    return zoomLevel;
  }

  const nextZoomLevel = clamp(value, 0.2, 4);
  applyEditorViewportZoom(canvas, canvasDocumentSize, nextZoomLevel, devicePixelRatioBaseline);
  restoreEditorViewportAnchor({
    canvas,
    viewportElement,
    stageElement,
    canvasDocumentSize,
    zoomLevel: nextZoomLevel,
    anchor: { relativeX: 0.5, relativeY: 0.5 },
    onSynced: syncViewportState,
    ...getDevicePixelRatioBaselineOptions(devicePixelRatioBaseline),
  });
  canvas.requestRenderAll();
  syncRuntimeState();
  return nextZoomLevel;
}
