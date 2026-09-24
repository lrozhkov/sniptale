import type { Canvas, Rect } from 'fabric';
import { Point } from 'fabric';
import { getEditorCanvasWorkspaceInsets } from '../viewport/editing-surface';
import { EditorCanvas } from '../viewport/render-region';
import type { CropSelection } from '../core/types';
import {
  applyCropGuideSelection,
  clampEditorCropSelectionPosition,
  createCropGuideRect,
  normalizeEditorFreeCanvasSelection,
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
  mode?: 'crop' | 'expand';
}

export function previewEditorCanvasSizeSelection(
  context: PreviewEditorCanvasSizeSelectionContext
): CropGuideState | null {
  if (!context.canvas) {
    return null;
  }

  const baseSelection = context.cropSelection ?? { left: 0, top: 0, width: 1, height: 1 };
  if (context.mode === 'expand') {
    const width = Math.max(1, Math.round(context.width));
    const height = Math.max(1, Math.round(context.height));
    const left = context.cropSelection?.left ?? 0;
    const top = context.cropSelection?.top ?? 0;
    if (context.canvas instanceof EditorCanvas) {
      context.canvas.extendWorkspaceToContain({
        left,
        top,
        right: left + width,
        bottom: top + height,
      });
    }
    const nextSelection = normalizeEditorFreeCanvasSelection(
      {
        left,
        top,
        width,
        height,
      },
      context.canvasDocumentSize,
      context.canvas.getZoom(),
      getEditorCanvasWorkspaceInsets(context.canvas, context.canvasDocumentSize)
    );
    if (isSameCropSelection(nextSelection, context.cropSelection)) return null;
    const cropGuide = context.cropGuide ?? createCropGuideRect(new Point(0, 0));
    applyCropGuideSelection(cropGuide, nextSelection, 'selection');
    cropGuide.hasBorders = false;
    if (!context.cropGuide) context.canvas.add(cropGuide);
    context.canvas.setActiveObject(cropGuide);
    context.canvas.requestRenderAll();
    return { cropGuide, cropSelection: nextSelection };
  }
  const requestedSelection = {
    left: baseSelection.left,
    top: baseSelection.top,
    width: Math.max(1, Math.round(context.width)),
    height: Math.max(1, Math.round(context.height)),
  };

  if (
    !context.cropSelection &&
    requestedSelection.width === context.canvasDocumentSize.width &&
    requestedSelection.height === context.canvasDocumentSize.height
  ) {
    return null;
  }

  const fit = Math.min(
    1,
    context.canvasDocumentSize.width / requestedSelection.width,
    context.canvasDocumentSize.height / requestedSelection.height
  );
  const nextCropSelection = clampEditorCropSelectionPosition(
    {
      ...requestedSelection,
      width: Math.max(1, Math.round(requestedSelection.width * fit)),
      height: Math.max(1, Math.round(requestedSelection.height * fit)),
    },
    context.canvasDocumentSize
  );

  if (nextCropSelection && isSameCropSelection(nextCropSelection, context.cropSelection)) {
    return null;
  }

  const cropGuide = context.cropGuide ?? createCropGuideRect(new Point(0, 0));
  applyCropGuideSelection(cropGuide, nextCropSelection, 'selection');
  if (!context.cropGuide) {
    context.canvas.add(cropGuide);
  }
  context.canvas.setActiveObject(cropGuide);
  context.canvas.requestRenderAll();

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
  return {
    cropGuide: null,
    cropSelection: null,
  };
}
