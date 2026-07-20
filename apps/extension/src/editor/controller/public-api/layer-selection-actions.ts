import {
  deleteEditorSelection,
  duplicateEditorSelection,
  nudgeEditorSelection,
  reorderEditorLayer,
  selectEditorLayerById,
} from '../public-actions';
import {
  createLayerHistoryBindings,
  createLayerReachableSourceBindings,
  createLayerSelectionBindings,
} from './layer-bindings';
import type { EditorControllerPublicApiAdapter } from './types';

export function deleteEditorControllerSelection(
  controller: EditorControllerPublicApiAdapter
): void {
  deleteEditorSelection({
    canvas: controller.canvas,
    ...createLayerHistoryBindings(controller),
  });
}

export async function duplicateEditorControllerSelection(
  controller: EditorControllerPublicApiAdapter
): Promise<void> {
  await duplicateEditorSelection({
    canvas: controller.canvas,
    prepareObject: (object) => controller.prepareObject(object),
    nextLabelIndex: (type) =>
      controller.nextLabelIndex(type as Parameters<typeof controller.nextLabelIndex>[0]),
    ...createLayerHistoryBindings(controller),
  });
}

export function nudgeEditorControllerSelection(
  controller: EditorControllerPublicApiAdapter,
  nudge: { deltaX: number; deltaY: number }
): boolean {
  return nudgeEditorSelection({
    canvas: controller.canvas,
    deltaX: nudge.deltaX,
    deltaY: nudge.deltaY,
    source: controller.source,
    ...createLayerReachableSourceBindings(controller),
  });
}

export function reorderEditorControllerLayer(
  controller: EditorControllerPublicApiAdapter,
  draggedId: string,
  targetId: string
): void {
  reorderEditorLayer({
    canvas: controller.canvas,
    draggedId,
    targetId,
    sendFrameObjectsToBack: () => controller.sendFrameObjectsToBack(),
    commitHistory: () => controller.commitHistory(),
    syncRuntimeState: () => controller.syncRuntimeState(),
  });
}

export function selectEditorControllerLayer(
  controller: EditorControllerPublicApiAdapter,
  id: string,
  options: { additive?: boolean; focusViewport?: boolean; range?: boolean; toggle?: boolean } = {}
): void {
  selectEditorLayerById({
    canvas: controller.canvas,
    id,
    selectionOptions: {
      ...options,
      anchorId: controller.lastLayerSelectionAnchorId,
    },
    ...createLayerSelectionBindings(controller),
  });
  controller.setLastLayerSelectionAnchorId(id);
}
