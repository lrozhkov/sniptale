import { applyEditorViewportZoom } from '../../../viewport';
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
  options.canvas.setDimensions(resetCanvasSize);
  applyEditorViewportZoom(
    options.canvas,
    resetCanvasSize,
    options.zoomLevel,
    options.viewportDevicePixelRatioBaseline
  );
}
