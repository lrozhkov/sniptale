import type { Canvas } from 'fabric';
import { applyEditorViewportZoom } from '../../viewport';

export function prepareCanvasForDocumentLoad(options: {
  canvas: Canvas;
  canvasSize: { width: number; height: number };
  zoomLevel: number;
  viewportDevicePixelRatioBaseline?: number;
}): void {
  Reflect.deleteProperty(options.canvas, 'backgroundImage');
  options.canvas.setZoom(1);
  options.canvas.setDimensions(options.canvasSize);
  applyEditorViewportZoom(
    options.canvas,
    options.canvasSize,
    options.zoomLevel,
    options.viewportDevicePixelRatioBaseline
  );
  options.canvas.backgroundColor = 'transparent';
}

export function renderCanvasAfterDocumentLoad(canvas: Canvas): void {
  const syncRender = (canvas as Canvas & { renderAll?: () => void }).renderAll;
  if (typeof syncRender === 'function') {
    syncRender.call(canvas);
    return;
  }

  canvas.requestRenderAll();
}

export function maskCanvasElementDuringLoad(
  canvas: Canvas,
  backgroundColor: string
): (() => void) | undefined {
  const element =
    (
      canvas as Canvas & {
        getElement?: () => HTMLCanvasElement;
        lowerCanvasEl?: HTMLCanvasElement;
      }
    ).getElement?.() ?? (canvas as { lowerCanvasEl?: HTMLCanvasElement }).lowerCanvasEl;
  if (!element) {
    return undefined;
  }

  const previousBackgroundColor = element.style.backgroundColor;
  element.style.backgroundColor = backgroundColor;
  return () => {
    element.style.backgroundColor = previousBackgroundColor;
  };
}
