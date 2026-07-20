import type { Canvas, FabricObject, Point, Rect } from 'fabric';
import { useEditorStore } from '../../../state/useEditorStore';
import type { CropSelection, DrawSession } from '../../core/types';
import { getActiveEditorCropRect } from '../../tools/crop';
import { startEditorDrawSession } from '../../transient';

export function startEditorControllerDrawSession(options: {
  canvas: Canvas | null;
  tool: DrawSession['tool'];
  start: Point;
  object: FabricObject;
  cropGuide: Rect | null;
  prepareObject: (object: FabricObject) => void;
}): {
  drawSession: DrawSession | null;
  cropGuide: Rect | null;
  cropSelection: CropSelection | null;
} | null {
  const { canvas, tool, start, object, cropGuide, prepareObject } = options;
  if (!canvas) {
    return null;
  }

  const nextState = startEditorDrawSession({
    canvas,
    tool,
    start,
    object,
    cropGuide,
  });
  if (nextState.clearedExistingCropGuide) {
    useEditorStore.getState().setCropReady(false);
  }

  prepareObject(object);
  canvas.add(object);
  canvas.requestRenderAll();

  return {
    drawSession: nextState.drawSession,
    cropGuide: nextState.cropGuide,
    cropSelection: nextState.cropSelection,
  };
}

export function getEditorControllerActiveCropRect(
  drawSession: DrawSession | null,
  cropGuide: Rect | null
): Rect | null {
  return getActiveEditorCropRect(drawSession, cropGuide);
}
