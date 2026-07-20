import type { Canvas } from 'fabric';
import { reorderLayerObjects } from '../../../layer-actions';

export function reorderEditorLayer(options: {
  canvas: Canvas | null;
  draggedId: string;
  targetId: string;
  sendFrameObjectsToBack: () => void;
  commitHistory: () => void;
  syncRuntimeState: () => void;
}): void {
  const { canvas, draggedId, targetId, sendFrameObjectsToBack, commitHistory, syncRuntimeState } =
    options;
  if (!reorderLayerObjects(canvas, draggedId, targetId)) {
    return;
  }

  sendFrameObjectsToBack();
  canvas?.requestRenderAll();
  commitHistory();
  syncRuntimeState();
}
