import type { Canvas, Rect } from 'fabric';
import type { CropSelection } from '../../core/types';

export type CropGuideState = {
  cropGuide: Rect | null;
  cropSelection: CropSelection | null;
};

export function finalizeEditorCropSelection(
  canvas: Canvas,
  cropGuide: Rect,
  logCrop: (stage: string, payload?: Record<string, unknown>) => void,
  crop: CropSelection
): CropGuideState {
  clearCropGuideAfterApply(canvas, cropGuide);
  logCrop('apply:done', {
    crop,
    resultWidth: crop.width,
    resultHeight: crop.height,
  });

  return {
    cropGuide: null,
    cropSelection: null,
  };
}

function clearCropGuideAfterApply(canvas: Canvas, cropGuide: Rect): void {
  canvas.remove(cropGuide);
  canvas.discardActiveObject();
  canvas.requestRenderAll();
}

export function hideCropGuideForApply(canvas: Canvas, cropGuide: Rect): () => void {
  const previousVisibility = cropGuide.visible !== false;
  cropGuide.visible = false;
  canvas.discardActiveObject();
  canvas.requestRenderAll();

  return () => {
    cropGuide.visible = previousVisibility;
    canvas.setActiveObject(cropGuide);
    canvas.requestRenderAll();
  };
}

export function logCropApplyStart(
  logCrop: (stage: string, payload?: Record<string, unknown>) => void,
  crop: CropSelection,
  canvasDocumentSize: { width: number; height: number }
): void {
  logCrop('apply:start', {
    crop,
    canvasWidth: canvasDocumentSize.width,
    canvasHeight: canvasDocumentSize.height,
  });
}
