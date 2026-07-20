import type { Rect } from 'fabric';
import type { CropSelection } from '../core/types';

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
  const width = Math.min(canvasWidth - left, Math.max(1, Math.round(selection.width)));
  const height = Math.min(canvasHeight - top, Math.max(1, Math.round(selection.height)));

  return { left, top, width, height };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
