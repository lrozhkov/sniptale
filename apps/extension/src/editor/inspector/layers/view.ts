import { useEditorController } from '../../application/controller-context';
import { createLayerDropHandler } from './drop';
import { useLayerPanelHeight } from './height';
import { useLayerPanelState } from './state';
import type { EditorInspectorLayersPanelProps } from './types';

export function useLayerPanelView(args: EditorInspectorLayersPanelProps) {
  const controller = useEditorController();
  const state = useLayerPanelState({
    expanded: args.expanded,
    draggedLayerId: args.draggedLayerId,
    dragOverLayerId: args.dragOverLayerId,
    ...(args.setExpanded === undefined ? {} : { setExpanded: args.setExpanded }),
    ...(args.setDraggedLayerId === undefined ? {} : { setDraggedLayerId: args.setDraggedLayerId }),
    ...(args.setDragOverLayerId === undefined
      ? {}
      : { setDragOverLayerId: args.setDragOverLayerId }),
  });
  const height = useLayerPanelHeight({
    expanded: state.expanded,
    fillContainer: Boolean(args.fillContainer),
    layerCount: args.layers.length,
    ...(args.maxExpandedHeightRatio === undefined
      ? {}
      : { maxExpandedHeightRatio: args.maxExpandedHeightRatio }),
  });
  const handleLayerDrop = createLayerDropHandler({
    controller,
    draggedLayerId: state.draggedLayerId,
    setDraggedLayerId: state.setDraggedLayerId,
    setDragOverLayerId: state.setDragOverLayerId,
  });

  return {
    actions: {
      handleLayerDrop,
      toggleAutoNavigateSelectedLayer: () =>
        state.setAutoNavigateSelectedLayer((enabled) => !enabled),
      toggleExpanded: () => state.setExpanded((expanded) => !expanded),
    },
    layout: {
      expandedHeight: height.expandedHeight,
      reserveScrollbarGutter: true,
      scrollable: args.fillContainer || height.scrollable,
    },
    refs: {
      actionsRef: height.actionsRef,
      bodyRef: height.bodyRef,
      frameRef: height.frameRef,
      headerRef: height.headerRef,
      listRef: height.listRef,
    },
    state,
  };
}
