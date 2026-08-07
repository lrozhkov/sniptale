import type { Canvas } from 'fabric';
import { reorderLayerObjects } from '../../../layer-actions';
import { synchronizeFrameAnnotationOrdering } from '../../../../frame-annotation/proxy';

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
  synchronizeFrameAnnotationOrdering(canvas?.getObjects?.() ?? []);
  canvas?.requestRenderAll();
  commitHistory();
  syncRuntimeState();
}
