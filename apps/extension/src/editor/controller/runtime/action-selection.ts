import type { Canvas } from 'fabric';
import { moveLayerSelection, moveLayerSelectionToEdge } from '../layer-actions/reorder/selection';

export function moveEditorSelection(options: {
  canvas: Canvas | null;
  direction: 1 | -1;
  sendFrameObjectsToBack: () => void;
  commitHistory: () => void;
  syncRuntimeState: () => void;
}): void {
  const { canvas, direction, sendFrameObjectsToBack, commitHistory, syncRuntimeState } = options;
  if (!moveLayerSelection(canvas, direction)) {
    return;
  }

  sendFrameObjectsToBack();
  canvas?.requestRenderAll();
  commitHistory();
  syncRuntimeState();
}

export function moveEditorSelectionToEdge(options: {
  canvas: Canvas | null;
  edge: 'front' | 'back';
  sendFrameObjectsToBack: () => void;
  commitHistory: () => void;
  syncRuntimeState: () => void;
}): void {
  const { canvas, edge, sendFrameObjectsToBack, commitHistory, syncRuntimeState } = options;
  if (!moveLayerSelectionToEdge(canvas, edge)) {
    return;
  }

  sendFrameObjectsToBack();
  canvas?.requestRenderAll();
  commitHistory();
  syncRuntimeState();
}
