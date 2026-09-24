import type { Rect } from 'fabric';
import type { CropSelection } from '../core/types';
import { getEditorWorkspaceMargin } from '../viewport/editing-surface';
import {
  createEditorWorkspaceInsets,
  type EditorWorkspaceInsets,
} from '../viewport/workspace-extent';

export function createCropSelectionFromRect(cropGuide: Rect): CropSelection {
  return {
    left: Math.round(cropGuide.left ?? 0),
    top: Math.round(cropGuide.top ?? 0),
    width: Math.max(
      1,
      Math.round(((cropGuide.width ?? 0) as number) * ((cropGuide.scaleX ?? 1) as number))
    ),
    height: Math.max(
      1,
      Math.round(((cropGuide.height ?? 0) as number) * ((cropGuide.scaleY ?? 1) as number))
    ),
  };
}

export function normalizeEditorCropSelection(
  selection: CropSelection,
  canvasDocumentSize: { width: number; height: number }
): CropSelection {
  const canvasWidth = Math.max(1, canvasDocumentSize.width);
  const canvasHeight = Math.max(1, canvasDocumentSize.height);
  const left = clamp(Math.round(selection.left), 0, canvasWidth - 1);
  const top = clamp(Math.round(selection.top), 0, canvasHeight - 1);
  const right = clamp(
    Math.round(selection.left + Math.max(1, selection.width)),
    left + 1,
    canvasWidth
  );
  const bottom = clamp(
    Math.round(selection.top + Math.max(1, selection.height)),
    top + 1,
    canvasHeight
  );
  const width = right - left;
  const height = bottom - top;

  return { left, top, width, height };
}

export function getEditorFreeCanvasBounds(
  canvasDocumentSize: { width: number; height: number },
  zoom = 1,
  insets: EditorWorkspaceInsets = createEditorWorkspaceInsets(
    getEditorWorkspaceMargin(canvasDocumentSize)
  )
) {
  const inset = Math.ceil(20 / Math.max(0.2, zoom));
  return {
    left: -insets.left + inset,
    top: -insets.top + inset,
    right: canvasDocumentSize.width + insets.right - inset,
    bottom: canvasDocumentSize.height + insets.bottom - inset,
  };
}

/** Keeps free selection handles reachable at the scrollable workspace edge. */
export function normalizeEditorFreeCanvasSelection(
  selection: CropSelection,
  canvasDocumentSize: { width: number; height: number },
  zoom = 1,
  insets?: EditorWorkspaceInsets
): CropSelection {
  const bounds = getEditorFreeCanvasBounds(canvasDocumentSize, zoom, insets);
  const left = clamp(Math.round(selection.left), bounds.left, bounds.right - 1);
  const top = clamp(Math.round(selection.top), bounds.top, bounds.bottom - 1);
  const right = clamp(
    Math.round(selection.left + Math.max(1, selection.width)),
    left + 1,
    bounds.right
  );
  const bottom = clamp(
    Math.round(selection.top + Math.max(1, selection.height)),
    top + 1,
    bounds.bottom
  );
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

export function clampEditorFreeCanvasSelectionPosition(
  selection: CropSelection,
  canvasDocumentSize: { width: number; height: number },
  zoom = 1,
  insets?: EditorWorkspaceInsets
): CropSelection {
  const bounds = getEditorFreeCanvasBounds(canvasDocumentSize, zoom, insets);
  const width = Math.min(bounds.right - bounds.left, Math.max(1, Math.round(selection.width)));
  const height = Math.min(bounds.bottom - bounds.top, Math.max(1, Math.round(selection.height)));
  return {
    left: clamp(Math.round(selection.left), bounds.left, bounds.right - width),
    top: clamp(Math.round(selection.top), bounds.top, bounds.bottom - height),
    width,
    height,
  };
}

export function clampEditorCropSelectionPosition(
  selection: CropSelection,
  canvasDocumentSize: { width: number; height: number }
): CropSelection {
  const width = Math.min(canvasDocumentSize.width, Math.max(1, Math.round(selection.width)));
  const height = Math.min(canvasDocumentSize.height, Math.max(1, Math.round(selection.height)));
  return {
    left: clamp(Math.round(selection.left), 0, canvasDocumentSize.width - width),
    top: clamp(Math.round(selection.top), 0, canvasDocumentSize.height - height),
    width,
    height,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
