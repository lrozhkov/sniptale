import {
  deleteEditorSelection,
  duplicateEditorSelection,
  nudgeEditorSelection,
  reorderEditorLayer,
  reorderEditorLayerBlock,
  selectEditorLayerById,
} from '../public-actions';
import {
  createLayerHistoryBindings,
  createLayerReachableSourceBindings,
  createLayerSelectionBindings,
} from './layer-bindings';
import type { EditorControllerPublicApiAdapter } from './types';
import {
  getEditorDocumentTransitionRevision,
  hasPendingEditorDocumentTransition,
} from '../history/transition-queue';

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
  const canvas = controller.canvas;
  const source = controller.source;
  const token = controller.layerMutationToken;
  if (canvas && hasPendingEditorDocumentTransition(canvas)) return;
  const revision = canvas ? getEditorDocumentTransitionRevision(canvas) : 0;
  await duplicateEditorSelection({
    canvas,
    isCurrent: () =>
      controller.canvas === canvas &&
      controller.source === source &&
      controller.layerMutationToken === token &&
      (!canvas ||
        (!hasPendingEditorDocumentTransition(canvas) &&
          getEditorDocumentTransitionRevision(canvas) === revision)),
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
  options: {
    additive?: boolean;
    focusViewport?: boolean;
    preserveActiveTool?: boolean;
    range?: boolean;
    toggle?: boolean;
  } = {}
): void {
  const { preserveActiveTool, ...selectionOptions } = options;
  const selected = selectEditorLayerById({
    canvas: controller.canvas,
    id,
    selectionOptions: {
      ...selectionOptions,
      anchorId: controller.lastLayerSelectionAnchorId,
    },
    ...createLayerSelectionBindings(controller),
  });
  if (!selected) return;
  if (!preserveActiveTool) controller.switchToSelectTool();
  controller.setLastLayerSelectionAnchorId(id);
}

export function reorderEditorControllerLayerBlock(
  controller: EditorControllerPublicApiAdapter,
  ids: readonly string[],
  beforeId: string | null
): void {
  reorderEditorLayerBlock({
    canvas: controller.canvas,
    ids,
    beforeId,
    sendFrameObjectsToBack: () => controller.sendFrameObjectsToBack(),
    commitHistory: () => controller.commitHistory(),
    syncRuntimeState: () => controller.syncRuntimeState(),
  });
}
