import type { EditorInspectorContentController } from '../content/types';
import {
  createEditorInspectorContentActions,
  createEditorInspectorContentCoreView,
} from './content-props';

type SidebarExpandedController = Omit<EditorInspectorContentController, 'hasImage'>;

export function createEditorInspectorContentPanelProps(
  hasImage: boolean,
  controller: SidebarExpandedController
) {
  return {
    ...createEditorInspectorContentCoreView(hasImage, controller),
    ...createEditorInspectorContentActions(controller),
  };
}

export function createEditorInspectorLayersPanelProps(controller: SidebarExpandedController) {
  return {
    expanded: controller.layersExpanded,
    layers: controller.layers,
    selectedObjectCount: controller.selection.selectedObjectCount,
    draggedLayerId: controller.draggedLayerId,
    dragOverLayerId: controller.dragOverLayerId,
    onOpenLayerEffects: controller.onOpenLayerEffects,
    setExpanded: controller.setLayersExpanded,
    setDraggedLayerId: controller.setDraggedLayerId,
    setDragOverLayerId: controller.setDragOverLayerId,
  };
}
