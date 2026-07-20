import type { Canvas, Rect } from 'fabric';
import { Point } from 'fabric';
import { useEditorStore } from '../../state/useEditorStore';
import type { CropSelection } from '../core/types';
import {
  applyCropGuideSelection,
  createCropGuideRect,
  normalizeEditorCropSelection,
} from '../tools/crop';

type CropGuideState = {
  cropGuide: Rect | null;
  cropSelection: CropSelection | null;
};

interface PreviewEditorCanvasSizeSelectionContext {
  canvas: Canvas | null;
  cropGuide: Rect | null;
  cropSelection: CropSelection | null;
  canvasDocumentSize: { width: number; height: number };
  width: number;
  height: number;
}

export function previewEditorCanvasSizeSelection(
  context: PreviewEditorCanvasSizeSelectionContext
): CropGuideState | null {
  if (!context.canvas) {
    return null;
  }

  const mode = context.cropSelection ? 'selection' : 'preview';
  const baseSelection = context.cropSelection ?? { left: 0, top: 0, width: 1, height: 1 };
  const nextSelection = {
    left: baseSelection.left,
    top: baseSelection.top,
    width: Math.max(1, Math.round(context.width)),
    height: Math.max(1, Math.round(context.height)),
  };

  if (
    mode === 'preview' &&
    nextSelection.width === context.canvasDocumentSize.width &&
    nextSelection.height === context.canvasDocumentSize.height
  ) {
    return null;
  }

  const nextCropSelection =
    mode === 'selection'
      ? normalizeEditorCropSelection(nextSelection, context.canvasDocumentSize)
      : null;

  if (nextCropSelection && isSameCropSelection(nextCropSelection, context.cropSelection)) {
    return null;
  }

  const cropGuide = context.cropGuide ?? createCropGuideRect(new Point(0, 0));
  applyCropGuideSelection(cropGuide, nextCropSelection ?? nextSelection, mode);
  if (!context.cropGuide) {
    context.canvas.add(cropGuide);
  }
  context.canvas.setActiveObject(cropGuide);
  context.canvas.requestRenderAll();
  useEditorStore.getState().setCropReady(Boolean(nextCropSelection));

  return {
    cropGuide,
    cropSelection: nextCropSelection,
  };
}

function isSameCropSelection(left: CropSelection | null, right: CropSelection | null): boolean {
  if (!left || !right) {
    return false;
  }

  return (
    left.left === right.left &&
    left.top === right.top &&
    left.width === right.width &&
    left.height === right.height
  );
}

export function clearEditorCanvasSizePreview(context: {
  canvas: Canvas | null;
  cropGuide: Rect | null;
  cropSelection: CropSelection | null;
}): CropGuideState | null {
  if (!context.canvas || !context.cropGuide || context.cropSelection) {
    return null;
  }

  context.canvas.remove(context.cropGuide);
  context.canvas.discardActiveObject();
  context.canvas.requestRenderAll();
  useEditorStore.getState().setCropReady(false);
  return {
    cropGuide: null,
    cropSelection: null,
  };
}
