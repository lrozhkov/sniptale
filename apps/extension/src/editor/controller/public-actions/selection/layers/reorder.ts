import type { Canvas } from 'fabric';
import { reorderLayerObjects, reorderLayerBlockObjects } from '../../../layer-actions';
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

export function reorderEditorLayerBlock(options: {
  canvas: Canvas | null;
  ids: readonly string[];
  beforeId: string | null;
  sendFrameObjectsToBack: () => void;
  commitHistory: () => void;
  syncRuntimeState: () => void;
}): void {
  if (!reorderLayerBlockObjects(options.canvas, options.ids, options.beforeId)) return;
  options.sendFrameObjectsToBack();
  synchronizeFrameAnnotationOrdering(options.canvas?.getObjects?.() ?? []);
  options.canvas?.requestRenderAll();
  options.commitHistory();
  options.syncRuntimeState();
}
