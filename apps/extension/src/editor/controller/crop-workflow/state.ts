import type { Canvas, Rect } from 'fabric';
import { useEditorStore } from '../../state/useEditorStore';
import { cancelEditorCropDrawSession, clearEditorCropGuide } from '../transient';
import type { CropSelection, DrawSession } from '../core/types';

type CropGuideState = {
  cropGuide: Rect | null;
  cropSelection: CropSelection | null;
};

type DrawSessionState = {
  drawSession: DrawSession | null;
  cropSelection: CropSelection | null;
};

export function clearEditorControllerCropSelection(context: {
  canvas: Canvas | null;
  cropGuide: Rect | null;
}): CropGuideState | null {
  const { canvas, cropGuide } = context;
  if (!canvas || !cropGuide) {
    return null;
  }

  const nextState = clearEditorCropGuide({
    canvas,
    cropGuide,
  });
  useEditorStore.getState().setCropReady(false);
  canvas.requestRenderAll();
  return nextState;
}

export function cancelEditorControllerCropMode(context: {
  canvas: Canvas | null;
  cropGuide: Rect | null;
  drawSession: DrawSession | null;
  clearCropSelection: () => void;
  switchToSelectTool: () => void;
  syncRuntimeState: () => void;
}): DrawSessionState | null {
  const {
    canvas,
    cropGuide,
    drawSession,
    clearCropSelection,
    switchToSelectTool,
    syncRuntimeState,
  } = context;
  if (!canvas) {
    return null;
  }

  let nextDrawSession = drawSession;
  let nextCropSelection: CropSelection | null = null;

  if (cropGuide) {
    clearCropSelection();
  }

  if (drawSession?.tool === 'crop') {
    const nextState = cancelEditorCropDrawSession({
      canvas,
      drawSession,
    });
    nextDrawSession = nextState.drawSession;
    nextCropSelection = nextState.cropSelection;
  }

  switchToSelectTool();
  canvas.requestRenderAll();
  syncRuntimeState();
  return {
    drawSession: nextDrawSession,
    cropSelection: nextCropSelection,
  };
}
