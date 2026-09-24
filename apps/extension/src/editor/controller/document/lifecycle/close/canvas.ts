import type { Canvas } from 'fabric';

import { applyEditorViewportZoom } from '../../../viewport';
import { setEditorEditingSurfaceDimensions } from '../../../viewport/editing-surface';
import type { CloseEditorControllerCanvasOptions } from './types';

type CloseEditorControllerCanvasResetOptions = Pick<
  CloseEditorControllerCanvasOptions,
  'canvas' | 'zoomLevel' | 'setCanvasDocumentSize' | 'viewportDevicePixelRatioBaseline'
>;

export function resetClosedEditorCanvas(options: CloseEditorControllerCanvasResetOptions): void {
  options.canvas.discardActiveObject();
  options.canvas.clear();
  Reflect.deleteProperty(options.canvas, 'backgroundImage');
  options.canvas.backgroundColor = 'transparent';
  options.canvas.setZoom(1);

  const resetCanvasSize = { width: 0, height: 0 };
  options.setCanvasDocumentSize(resetCanvasSize);
  setEditorEditingSurfaceDimensions(options.canvas, resetCanvasSize);
  applyEditorViewportZoom(
    options.canvas,
    resetCanvasSize,
    options.zoomLevel,
    options.viewportDevicePixelRatioBaseline
  );
}

export function renderClosedEditorCanvas(canvas: Canvas): void {
  canvas.requestRenderAll();
}
