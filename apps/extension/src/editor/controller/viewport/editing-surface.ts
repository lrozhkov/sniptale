import type { Canvas } from 'fabric';
import { EditorCanvas } from './render-region';
import { createEditorWorkspaceInsets, type EditorWorkspaceInsets } from './workspace-extent';

export const EDITOR_WORKSPACE_MARGIN = 2048;
const MIN_EDITOR_WORKSPACE_MARGIN = 512;
const MAX_EDITOR_SURFACE_PIXELS = 32_000_000;

type DocumentSize = { width: number; height: number };
const documentSizes = new WeakMap<Canvas, DocumentSize>();

/** Keeps the editing surface within its backing-pixel budget for large images. */
export function getEditorWorkspaceMargin(size: DocumentSize): number {
  if (size.width <= 0 || size.height <= 0) return EDITOR_WORKSPACE_MARGIN;
  const maxMargin = Math.floor(
    (Math.sqrt((size.width - size.height) ** 2 + 4 * MAX_EDITOR_SURFACE_PIXELS) -
      size.width -
      size.height) /
      4
  );
  return Math.max(MIN_EDITOR_WORKSPACE_MARGIN, Math.min(EDITOR_WORKSPACE_MARGIN, maxMargin));
}

export function getEditorEditingSurfaceSize(size: DocumentSize): DocumentSize {
  if (size.width <= 0 || size.height <= 0) return size;
  const margin = getEditorWorkspaceMargin(size);
  return {
    width: size.width + margin * 2,
    height: size.height + margin * 2,
  };
}

export function getEditorCanvasWorkspaceInsets(
  canvas: Canvas | null,
  size: DocumentSize
): EditorWorkspaceInsets {
  return canvas instanceof EditorCanvas
    ? canvas.getWorkspaceInsets()
    : createEditorWorkspaceInsets(getEditorWorkspaceMargin(size));
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
  if (canvas instanceof EditorCanvas && canvas.hasVirtualViewport) {
    return canvas.getDocumentClientRect();
  }
  const surface = getEditorEditingSurfaceSize(size);
  const margin = getEditorWorkspaceMargin(size);
  const scaleX = rect.width / surface.width;
  const scaleY = rect.height / surface.height;
  return {
    left: rect.left + margin * scaleX,
    top: rect.top + margin * scaleY,
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
    if (canvas instanceof EditorCanvas && canvas.hasVirtualViewport) {
      canvas.setDocumentGeometry(size, 0);
    }
    canvas.setDimensions(size);
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    return;
  }

  documentSizes.set(canvas, size);
  const surface = getEditorEditingSurfaceSize(size);
  const margin = getEditorWorkspaceMargin(size);
  if (canvas instanceof EditorCanvas && canvas.hasVirtualViewport) {
    canvas.setDocumentGeometry(size, margin);
    return;
  }
  const devicePixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  canvas.enableRetinaScaling =
    surface.width * surface.height * devicePixelRatio ** 2 <= MAX_EDITOR_SURFACE_PIXELS;
  canvas.setDimensions(surface);
  canvas.setViewportTransform([1, 0, 0, 1, margin, margin]);
}
