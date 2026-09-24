import type { Canvas } from 'fabric';
import { applyEditorViewportZoom } from '../../viewport';
import { setEditorEditingSurfaceDimensions } from '../../viewport/editing-surface';
import { EditorCanvas } from '../../viewport/render-region';

export function prepareCanvasForDocumentLoad(options: {
  canvas: Canvas;
  canvasSize: { width: number; height: number };
  zoomLevel: number;
  preserveViewport?: boolean;
  viewportDevicePixelRatioBaseline?: number;
}): void {
  Reflect.deleteProperty(options.canvas, 'backgroundImage');
  options.canvas.setZoom(1);
  setEditorEditingSurfaceDimensions(options.canvas, options.canvasSize, options.preserveViewport);
  applyEditorViewportZoom(
    options.canvas,
    options.canvasSize,
    options.zoomLevel,
    options.viewportDevicePixelRatioBaseline
  );
  if (options.canvas instanceof EditorCanvas) {
    options.canvas.ensureWorkspaceContainsObjects();
    if (!options.preserveViewport) options.canvas.centerDocumentInViewport();
  }
  options.canvas.backgroundColor = 'transparent';
}

/** Holds the visible tile while Fabric clears and asynchronously restores history objects. */
export function freezeCanvasVisualDuringLoad(canvas: Canvas): (() => void) | undefined {
  const element = (canvas as Canvas & { lowerCanvasEl?: HTMLCanvasElement }).lowerCanvasEl;
  const wrapper = (canvas as Canvas & { wrapperEl?: HTMLElement }).wrapperEl;
  if (!element || !wrapper || element.width <= 0 || element.height <= 0) return undefined;
  const snapshot = document.createElement('canvas');
  snapshot.width = element.width;
  snapshot.height = element.height;
  const context = snapshot.getContext('2d');
  if (!context) return undefined;
  try {
    context.drawImage(element, 0, 0);
  } catch {
    return undefined;
  }
  snapshot.style.position = 'absolute';
  snapshot.style.left = '0';
  snapshot.style.top = '0';
  snapshot.style.width = element.style.width || `${element.width}px`;
  snapshot.style.height = element.style.height || `${element.height}px`;
  snapshot.style.zIndex = '30';
  snapshot.style.pointerEvents = 'none';
  wrapper.append(snapshot);
  return () => snapshot.remove();
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
