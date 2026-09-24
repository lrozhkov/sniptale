import type { Canvas } from 'fabric';

export const EDITOR_WORKSPACE_MARGIN = 512;

type DocumentSize = { width: number; height: number };
const documentSizes = new WeakMap<Canvas, DocumentSize>();

export function getEditorEditingSurfaceSize(size: DocumentSize): DocumentSize {
  if (size.width <= 0 || size.height <= 0) return size;
  return {
    width: size.width + EDITOR_WORKSPACE_MARGIN * 2,
    height: size.height + EDITOR_WORKSPACE_MARGIN * 2,
  };
}

export function getEditorEditingDocumentSize(canvas: Canvas): DocumentSize | null {
  return documentSizes.get(canvas) ?? null;
}

export function getEditorDocumentClientRect(
  element: HTMLCanvasElement | null,
  size: DocumentSize,
  canvas: Canvas | null
): Pick<DOMRect, 'left' | 'top' | 'width' | 'height'> | null {
  const rect = element?.getBoundingClientRect();
  if (!rect) return null;
  if (!canvas || !getEditorEditingDocumentSize(canvas)) return rect;
  const surface = getEditorEditingSurfaceSize(size);
  const scaleX = rect.width / surface.width;
  const scaleY = rect.height / surface.height;
  return {
    left: rect.left + EDITOR_WORKSPACE_MARGIN * scaleX,
    top: rect.top + EDITOR_WORKSPACE_MARGIN * scaleY,
    width: size.width * scaleX,
    height: size.height * scaleY,
  };
}

export function setEditorEditingSurfaceDimensions(canvas: Canvas, size: DocumentSize): void {
  if (typeof canvas.setViewportTransform !== 'function') {
    canvas.setDimensions(size);
    return;
  }
  if (size.width <= 0 || size.height <= 0) {
    documentSizes.delete(canvas);
    canvas.setDimensions(size);
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    return;
  }

  documentSizes.set(canvas, size);
  canvas.setDimensions(getEditorEditingSurfaceSize(size));
  canvas.setViewportTransform([1, 0, 0, 1, EDITOR_WORKSPACE_MARGIN, EDITOR_WORKSPACE_MARGIN]);
}
