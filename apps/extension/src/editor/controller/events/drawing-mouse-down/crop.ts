import type { Canvas, FabricObject } from 'fabric';
import { handleCropMouseDown } from '../drawing-tool-actions/primitive';
import type { Bindings, DrawingMouseDownEvent, DrawingTool } from './types';

export function cropDown(
  bindings: Bindings,
  canvas: Canvas,
  tool: DrawingTool,
  event: DrawingMouseDownEvent
): boolean {
  if (tool !== 'crop' || !bindings.getCropSelectionMouseEnabled()) {
    return false;
  }

  if (!isCropGuideTarget(bindings, event.target)) {
    handleCropMouseDown(bindings, canvas.getScenePoint(event.e));
  }
  return true;
}

function isCropGuideTarget(
  bindings: Pick<Bindings, 'getCropGuide'>,
  target: FabricObject | undefined
): boolean {
  const cropGuide = bindings.getCropGuide();
  return Boolean(cropGuide && target === cropGuide);
}
