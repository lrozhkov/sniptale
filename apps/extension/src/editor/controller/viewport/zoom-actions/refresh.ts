import {
  applyEditorViewportZoom,
  captureEditorViewportAnchor,
  restoreEditorViewportAnchor,
} from '..';
import { getDevicePixelRatioBaselineOptions, type ZoomContext } from '../actions-types';

export function refreshEditorViewportPresentation(context: ZoomContext): void {
  const { canvas, viewportElement, stageElement, canvasDocumentSize, zoomLevel } = context;
  if (!canvas || !viewportElement) {
    return;
  }

  const anchor = captureEditorViewportAnchor({
    canvas,
    viewportElement,
    stageElement,
    canvasDocumentSize,
    zoomLevel,
    ...getDevicePixelRatioBaselineOptions(context.devicePixelRatioBaseline),
  });

  applyEditorViewportZoom(canvas, canvasDocumentSize, zoomLevel, context.devicePixelRatioBaseline);

  if (!anchor) {
    canvas.requestRenderAll();
    context.syncViewportState();
    return;
  }

  restoreEditorViewportAnchor({
    canvas,
    viewportElement,
    stageElement,
    canvasDocumentSize,
    zoomLevel,
    anchor,
    onSynced: context.syncViewportState,
    ...getDevicePixelRatioBaselineOptions(context.devicePixelRatioBaseline),
  });
  canvas.requestRenderAll();
}
