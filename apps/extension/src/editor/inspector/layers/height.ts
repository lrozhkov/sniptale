import React from 'react';
import {
  getLayerPanelMeasurement,
  type LayerPanelHeightState,
  type ResizeBehavior,
} from './measurement';
import { useAnimationFrameScheduler, useLayerPanelResizeObserver } from './height-observer';

function updateExpandedHeight(args: {
  behavior: ResizeBehavior;
  bodyRef: React.RefObject<HTMLDivElement | null>;
  cachedHeightRef: React.MutableRefObject<number | null>;
  frameRef: React.RefObject<HTMLDivElement | null>;
  headerRef: React.RefObject<HTMLDivElement | null>;
  listRef: React.RefObject<HTMLDivElement | null>;
  actionsRef: React.RefObject<HTMLDivElement | null>;
  maxExpandedHeightRatio?: number;
  setHeightState: React.Dispatch<React.SetStateAction<LayerPanelHeightState>>;
}) {
  const measurement = getLayerPanelMeasurement(args);
  if (measurement === null) {
    return;
  }

  args.cachedHeightRef.current = measurement.expandedHeight;
  args.setHeightState((current) =>
    current.expandedHeight === measurement.expandedHeight &&
    current.scrollable === measurement.scrollable
      ? current
      : measurement
  );
}

type ExpandedLayerHeightArgs = {
  expanded: boolean;
  fillContainer: boolean;
  layerCount: number;
  bodyRef: React.RefObject<HTMLDivElement | null>;
  frameRef: React.RefObject<HTMLDivElement | null>;
  headerRef: React.RefObject<HTMLDivElement | null>;
  listRef: React.RefObject<HTMLDivElement | null>;
  actionsRef: React.RefObject<HTMLDivElement | null>;
  maxExpandedHeightRatio?: number;
};

function useLayerHeightMeasureCallback(args: {
  expandedArgs: ExpandedLayerHeightArgs;
  cachedHeightRef: React.MutableRefObject<number | null>;
  setHeightState: React.Dispatch<React.SetStateAction<LayerPanelHeightState>>;
}) {
  return React.useCallback(
    (behavior: ResizeBehavior) =>
      updateExpandedHeight({
        behavior,
        bodyRef: args.expandedArgs.bodyRef,
        cachedHeightRef: args.cachedHeightRef,
        frameRef: args.expandedArgs.frameRef,
        headerRef: args.expandedArgs.headerRef,
        listRef: args.expandedArgs.listRef,
        actionsRef: args.expandedArgs.actionsRef,
        ...(args.expandedArgs.maxExpandedHeightRatio === undefined
          ? {}
          : { maxExpandedHeightRatio: args.expandedArgs.maxExpandedHeightRatio }),
        setHeightState: args.setHeightState,
      }),
    [args.cachedHeightRef, args.expandedArgs, args.setHeightState]
  );
}

function useExpandedPanelLifecycle(args: {
  expanded: boolean;
  layerCount: number;
  cachedHeightRef: React.MutableRefObject<number | null>;
  frozenAfterDeleteRef: React.MutableRefObject<boolean>;
  lastLayerCountRef: React.MutableRefObject<number>;
  cancel: () => void;
  measureHeight: (behavior: ResizeBehavior) => void;
  setHeightState: React.Dispatch<React.SetStateAction<LayerPanelHeightState>>;
}) {
  const {
    expanded,
    layerCount,
    cachedHeightRef,
    frozenAfterDeleteRef,
    lastLayerCountRef,
    cancel,
    measureHeight,
    setHeightState,
  } = args;
  const previousExpandedRef = React.useRef<boolean | null>(null);

  React.useLayoutEffect(() => {
    if (!hasExpandedStateChanged(previousExpandedRef, expanded)) {
      return;
    }

    updateExpandedPanelLifecycle({
      cachedHeightRef,
      cancel,
      expanded,
      frozenAfterDeleteRef,
      lastLayerCountRef,
      layerCount,
      measureHeight,
      setHeightState,
    });
  }, [
    expanded,
    layerCount,
    cachedHeightRef,
    frozenAfterDeleteRef,
    lastLayerCountRef,
    cancel,
    measureHeight,
    setHeightState,
  ]);
}

function hasExpandedStateChanged(
  previousExpandedRef: React.MutableRefObject<boolean | null>,
  expanded: boolean
) {
  const previousExpanded = previousExpandedRef.current;
  previousExpandedRef.current = expanded;
  return previousExpanded === null || previousExpanded !== expanded;
}

function updateExpandedPanelLifecycle(args: {
  cachedHeightRef: React.MutableRefObject<number | null>;
  cancel: () => void;
  expanded: boolean;
  frozenAfterDeleteRef: React.MutableRefObject<boolean>;
  lastLayerCountRef: React.MutableRefObject<number>;
  layerCount: number;
  measureHeight: (behavior: ResizeBehavior) => void;
  setHeightState: React.Dispatch<React.SetStateAction<LayerPanelHeightState>>;
}) {
  if (!args.expanded) {
    resetCollapsedHeightState(args);
    return;
  }

  syncExpandedHeightState(args);
}

function resetCollapsedHeightState(args: {
  cachedHeightRef: React.MutableRefObject<number | null>;
  cancel: () => void;
  frozenAfterDeleteRef: React.MutableRefObject<boolean>;
  lastLayerCountRef: React.MutableRefObject<number>;
  layerCount: number;
  setHeightState: React.Dispatch<React.SetStateAction<LayerPanelHeightState>>;
}) {
  args.cachedHeightRef.current = null;
  args.frozenAfterDeleteRef.current = false;
  args.lastLayerCountRef.current = args.layerCount;
  args.setHeightState({ expandedHeight: null, scrollable: false });
  args.cancel();
}

function syncExpandedHeightState(args: {
  frozenAfterDeleteRef: React.MutableRefObject<boolean>;
  lastLayerCountRef: React.MutableRefObject<number>;
  layerCount: number;
  measureHeight: (behavior: ResizeBehavior) => void;
}) {
  args.frozenAfterDeleteRef.current = false;
  args.lastLayerCountRef.current = args.layerCount;
  args.measureHeight('measure');
}

function useLayerCountHeightLifecycle(args: {
  expanded: boolean;
  layerCount: number;
  frozenAfterDeleteRef: React.MutableRefObject<boolean>;
  lastLayerCountRef: React.MutableRefObject<number>;
  measureHeight: (behavior: ResizeBehavior) => void;
}) {
  const { expanded, layerCount, frozenAfterDeleteRef, lastLayerCountRef, measureHeight } = args;

  React.useLayoutEffect(() => {
    if (!expanded) {
      lastLayerCountRef.current = layerCount;
      return;
    }

    const previousLayerCount = lastLayerCountRef.current;
    if (layerCount < previousLayerCount) {
      frozenAfterDeleteRef.current = true;
      measureHeight('clamp');
    } else if (layerCount > previousLayerCount) {
      measureHeight(frozenAfterDeleteRef.current ? 'clamp' : 'measure');
    }

    lastLayerCountRef.current = layerCount;
  }, [expanded, layerCount, frozenAfterDeleteRef, lastLayerCountRef, measureHeight]);
}

function useExpandedLayerHeightLifecycles(args: {
  expandedArgs: ExpandedLayerHeightArgs;
  cachedHeightRef: React.MutableRefObject<number | null>;
  frozenAfterDeleteRef: React.MutableRefObject<boolean>;
  lastLayerCountRef: React.MutableRefObject<number>;
  cancel: () => void;
  measureHeight: (behavior: ResizeBehavior) => void;
  schedule: (behavior: ResizeBehavior) => void;
  setHeightState: React.Dispatch<React.SetStateAction<LayerPanelHeightState>>;
}) {
  useExpandedPanelLifecycle({
    expanded: args.expandedArgs.expanded && !args.expandedArgs.fillContainer,
    layerCount: args.expandedArgs.layerCount,
    cachedHeightRef: args.cachedHeightRef,
    frozenAfterDeleteRef: args.frozenAfterDeleteRef,
    lastLayerCountRef: args.lastLayerCountRef,
    cancel: args.cancel,
    measureHeight: args.measureHeight,
    setHeightState: args.setHeightState,
  });
  useLayerCountHeightLifecycle({
    expanded: args.expandedArgs.expanded && !args.expandedArgs.fillContainer,
    layerCount: args.expandedArgs.layerCount,
    frozenAfterDeleteRef: args.frozenAfterDeleteRef,
    lastLayerCountRef: args.lastLayerCountRef,
    measureHeight: args.measureHeight,
  });
  useLayerPanelResizeObserver({
    expanded: args.expandedArgs.expanded && !args.expandedArgs.fillContainer,
    frameRef: args.expandedArgs.frameRef,
    frozenAfterDeleteRef: args.frozenAfterDeleteRef,
    cancel: args.cancel,
    schedule: args.schedule,
  });
}

function useExpandedLayerHeight(args: ExpandedLayerHeightArgs) {
  const [heightState, setHeightState] = React.useState<LayerPanelHeightState>({
    expandedHeight: null,
    scrollable: false,
  });
  const cachedHeightRef = React.useRef<number | null>(null);
  const frozenAfterDeleteRef = React.useRef(false);
  const lastLayerCountRef = React.useRef(args.layerCount);
  const measureHeight = useLayerHeightMeasureCallback({
    expandedArgs: args,
    cachedHeightRef,
    setHeightState,
  });
  const { cancel, schedule } = useAnimationFrameScheduler(measureHeight);

  useExpandedLayerHeightLifecycles({
    expandedArgs: args,
    cachedHeightRef,
    frozenAfterDeleteRef,
    lastLayerCountRef,
    cancel,
    measureHeight,
    schedule,
    setHeightState,
  });

  return heightState;
}

export function useLayerPanelHeight(args: {
  expanded: boolean;
  fillContainer: boolean;
  layerCount: number;
  maxExpandedHeightRatio?: number;
}) {
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const headerRef = React.useRef<HTMLDivElement | null>(null);
  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const actionsRef = React.useRef<HTMLDivElement | null>(null);
  const expandedHeight = useExpandedLayerHeight({
    ...args,
    actionsRef,
    bodyRef,
    frameRef,
    headerRef,
    listRef,
    ...(args.maxExpandedHeightRatio === undefined
      ? {}
      : { maxExpandedHeightRatio: args.maxExpandedHeightRatio }),
  });

  return {
    bodyRef,
    expandedHeight: expandedHeight.expandedHeight,
    frameRef,
    headerRef,
    listRef,
    scrollable: expandedHeight.scrollable,
    actionsRef,
  };
}
