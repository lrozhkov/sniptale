import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
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
  const { initialScrollOffset, onScrollOffsetChange } = args;
  useLayoutEffect(() => {
    const list = height.listRef.current;
    if (!list || !state.expanded) return;
    if (initialScrollOffset === undefined && !onScrollOffsetChange) return;
    if (initialScrollOffset !== undefined) list.scrollTop = initialScrollOffset;
    const remember = () => onScrollOffsetChange?.(list.scrollTop);
    list.addEventListener('scroll', remember, { passive: true });
    return () => list.removeEventListener('scroll', remember);
  }, [height.listRef, state.expanded, initialScrollOffset, onScrollOffsetChange]);
  const handleLayerDrop = useMemo(
    () =>
      createLayerDropHandler({
        controller,
        draggedLayerId: state.draggedLayerId,
        setDraggedLayerId: state.setDraggedLayerId,
        setDragOverLayerId: state.setDragOverLayerId,
      }),
    [controller, state.draggedLayerId, state.setDraggedLayerId, state.setDragOverLayerId]
  );
  const openLayerEffects = useRef(args.onOpenLayerEffects);
  // Stable row events call only the handler from the latest committed panel render.
  useLayoutEffect(() => {
    openLayerEffects.current = args.onOpenLayerEffects;
  }, [args.onOpenLayerEffects]);
  const handleOpenLayerEffects = useCallback<EditorInspectorLayersPanelProps['onOpenLayerEffects']>(
    (...parameters) => openLayerEffects.current(...parameters),
    []
  );

  return {
    actions: {
      handleLayerDrop,
      handleOpenLayerEffects,
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
