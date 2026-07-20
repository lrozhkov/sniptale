import type { Canvas, Rect } from 'fabric';
import type { DrawSession } from '../../core/types';

interface CancelEditorTransientInteractionOptions {
  canvas: Canvas | null;
  drawSession: DrawSession | null;
  cropGuide: Rect | null;
  activeTool: string;
  clearCropSelection: () => void;
  switchToSelectTool: () => void;
  syncRuntimeState: () => void;
}

export function cancelEditorTransientInteraction(
  options: CancelEditorTransientInteractionOptions
): { changed: boolean; drawSession: DrawSession | null } {
  const {
    canvas,
    drawSession,
    cropGuide,
    activeTool,
    clearCropSelection,
    switchToSelectTool,
    syncRuntimeState,
  } = options;
  if (!canvas) {
    return { changed: false, drawSession };
  }

  let changed = false;
  let nextDrawSession = drawSession;

  if (drawSession?.object) {
    canvas.remove(drawSession.object);
    nextDrawSession = null;
    changed = true;
  }

  if (cropGuide) {
    clearCropSelection();
    changed = true;
  }

  if (canvas.getActiveObjects().length > 0) {
    canvas.discardActiveObject();
    changed = true;
  }

  if (activeTool !== 'select') {
    switchToSelectTool();
    changed = true;
  }

  if (changed) {
    canvas.requestRenderAll();
    syncRuntimeState();
  }

  return { changed, drawSession: nextDrawSession };
}
