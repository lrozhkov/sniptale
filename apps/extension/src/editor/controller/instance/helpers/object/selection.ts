import { moveEditorSelection, moveEditorSelectionToEdge } from '../../../runtime/actions';
import type { EditorControllerInstance } from '../../types';

export function moveSelectionForController(
  controller: EditorControllerInstance,
  direction: 1 | -1
): void {
  moveEditorSelection({
    canvas: controller.canvas,
    direction,
    sendFrameObjectsToBack: () => controller.sendFrameObjectsToBack(),
    commitHistory: () => controller.commitHistory(),
    syncRuntimeState: () => controller.syncRuntimeState(),
  });
}

export function moveSelectionToEdgeForController(
  controller: EditorControllerInstance,
  edge: 'front' | 'back'
): void {
  moveEditorSelectionToEdge({
    canvas: controller.canvas,
    edge,
    sendFrameObjectsToBack: () => controller.sendFrameObjectsToBack(),
    commitHistory: () => controller.commitHistory(),
    syncRuntimeState: () => controller.syncRuntimeState(),
  });
}
