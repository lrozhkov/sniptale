import { cancelPendingEditorSimplify } from '../../../drawing/simplify-runtime';
import type { Canvas, Rect } from 'fabric';
import type { DrawSession } from '../../core/types';
import { cancelEditorDrawingArrowBend } from '../../../drawing/object/controls/arrow';

interface CancelEditorTransientInteractionOptions {
  canvas: Canvas | null;
  drawSession: DrawSession | null;
  cropGuide: Rect | null;
  activeTool: string;
  preserveActiveTool?: boolean;
  preservePendingSimplify?: boolean;
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

  // Pointer cleanup on focus loss must not cancel work submitted on pointerup.
  let changed = options.preservePendingSimplify ? false : cancelPendingEditorSimplify(canvas);
  let nextDrawSession = drawSession;

  if (cancelEditorDrawingArrowBend(canvas)) {
    syncRuntimeState();
    return { changed: true, drawSession };
  }

  if (drawSession?.object || cropGuide) {
    if (drawSession?.object) {
      canvas.remove(drawSession.object);
      nextDrawSession = null;
    }
    if (cropGuide) clearCropSelection();
    changed = true;
  } else if (canvas.getActiveObjects().length > 0) {
    canvas.discardActiveObject();
    changed = true;
  } else if (activeTool !== 'select' && !options.preserveActiveTool) {
    switchToSelectTool();
    changed = true;
  }

  if (changed) {
    canvas.requestRenderAll();
    syncRuntimeState();
  }

  return { changed, drawSession: nextDrawSession };
}
