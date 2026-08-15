import type { Canvas, FabricObject } from 'fabric';
import { createCropGuideRect } from '../tools/crop';
import type { EditorControllerEventBindings } from '../events/types';
import type { EditorTool } from '../../../features/editor/document/types';

export function cropDown(
  bindings: EditorControllerEventBindings,
  canvas: Canvas,
  tool: EditorTool,
  event: { e: import('fabric').TPointerEvent; target?: FabricObject }
): boolean {
  if (tool !== 'crop' || !bindings.getCropSelectionMouseEnabled()) {
    return false;
  }

  if (!isCropGuideTarget(bindings, event.target)) {
    const point = canvas.getScenePoint(event.e);
    const pointerId = 'pointerId' in event.e ? event.e.pointerId : null;
    bindings.startDrawSession('crop', point, createCropGuideRect(point), pointerId);
  }
  return true;
}

function isCropGuideTarget(
  bindings: Pick<EditorControllerEventBindings, 'getCropGuide'>,
  target: FabricObject | undefined
): boolean {
  const cropGuide = bindings.getCropGuide();
  return Boolean(cropGuide && target === cropGuide);
}
