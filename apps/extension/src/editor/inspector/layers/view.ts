import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLayerPanelHeight } from './height';
import { useLayerPanelState } from './state';
import type { EditorInspectorLayersPanelProps } from './types';

export function useLayerPanelView(args: EditorInspectorLayersPanelProps) {
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
  const [listOverflows, setListOverflows] = useState(false);
  const rowIdentities = args.layers.map((layer) => layer.id).join(':');
  useLayoutEffect(() => {
    const list = height.listRef.current;
    if (!list || !state.expanded) {
      setListOverflows(false);
      return;
    }
    const measure = () => setListOverflows(list.scrollHeight > list.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    for (const row of Array.from(list.children)) observer.observe(row);
    return () => observer.disconnect();
  }, [height.listRef, state.expanded, rowIdentities]);
  const { initialScrollOffset, onScrollOffsetChange } = args;
  useLayoutEffect(() => {
    const list = height.listRef.current;
    if (list && state.expanded && initialScrollOffset !== undefined)
      list.scrollTop = initialScrollOffset;
  }, [height.listRef, state.expanded, initialScrollOffset]);
  useEffect(() => {
    const list = height.listRef.current;
    if (!list || !state.expanded || !onScrollOffsetChange) return;
    const remember = () => onScrollOffsetChange(list.scrollTop);
    list.addEventListener('scroll', remember, { passive: true });
    return () => list.removeEventListener('scroll', remember);
  }, [height.listRef, state.expanded, onScrollOffsetChange]);
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
      handleOpenLayerEffects,
      toggleAutoNavigateSelectedLayer: () =>
        state.setAutoNavigateSelectedLayer((enabled) => !enabled),
      toggleExpanded: () => state.setExpanded((expanded) => !expanded),
    },
    layout: {
      expandedHeight: height.expandedHeight,
      reserveScrollbarGutter: listOverflows,
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
