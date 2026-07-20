import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ScenarioStep } from '../../features/scenario/contracts/types/project';
import { buildScenarioWorkspaceWindow, resolveScenarioWorkspaceVisibleItems } from './helpers';

type MeasuredHeightRefs = {
  measuredNodesRef: React.MutableRefObject<Map<string, HTMLDivElement>>;
  refCallbacksRef: React.MutableRefObject<Map<string, (node: HTMLDivElement | null) => void>>;
  resizeObserversRef: React.MutableRefObject<Map<string, ResizeObserver>>;
};

function useScenarioWorkspaceViewport(scrollContainer: HTMLDivElement | null) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(900);

  useEffect(() => {
    if (!scrollContainer) {
      setScrollTop(0);
      setViewportHeight(900);
      return;
    }

    const syncViewport = () => {
      setScrollTop(scrollContainer.scrollTop);
      setViewportHeight(scrollContainer.clientHeight);
    };

    syncViewport();
    scrollContainer.addEventListener('scroll', syncViewport, { passive: true });

    const resizeObserver = new ResizeObserver(syncViewport);
    resizeObserver.observe(scrollContainer);

    return () => {
      scrollContainer.removeEventListener('scroll', syncViewport);
      resizeObserver.disconnect();
    };
  }, [scrollContainer]);

  return { scrollTop, viewportHeight };
}

function useMeasuredHeightCleanup(refs: MeasuredHeightRefs) {
  useEffect(
    () => () => {
      refs.resizeObserversRef.current.forEach((observer) => observer.disconnect());
      refs.resizeObserversRef.current.clear();
      refs.measuredNodesRef.current.clear();
      refs.refCallbacksRef.current.clear();
    },
    [refs]
  );
}

function createMeasuredHeightCallback(
  args: MeasuredHeightRefs & {
    key: string;
    syncMeasuredHeight: (key: string, node: HTMLDivElement) => void;
  }
) {
  return (node: HTMLDivElement | null) => {
    const previousNode = args.measuredNodesRef.current.get(args.key) ?? null;
    if (previousNode === node) {
      return;
    }

    args.resizeObserversRef.current.get(args.key)?.disconnect();
    args.resizeObserversRef.current.delete(args.key);

    if (!node) {
      args.measuredNodesRef.current.delete(args.key);
      return;
    }

    args.measuredNodesRef.current.set(args.key, node);

    const syncHeight = () => args.syncMeasuredHeight(args.key, node);
    const observer = new ResizeObserver(syncHeight);
    observer.observe(node);
    args.resizeObserversRef.current.set(args.key, observer);
    window.requestAnimationFrame(syncHeight);
  };
}

function useScenarioWorkspaceMeasurements() {
  const [measuredHeights, setMeasuredHeights] = useState<Record<string, number>>({});
  const measuredNodesRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const refCallbacksRef = useRef<Map<string, (node: HTMLDivElement | null) => void>>(new Map());
  const resizeObserversRef = useRef<Map<string, ResizeObserver>>(new Map());
  const refs = useMemo(
    () => ({ measuredNodesRef, refCallbacksRef, resizeObserversRef }),
    [measuredNodesRef, refCallbacksRef, resizeObserversRef]
  );

  useMeasuredHeightCleanup(refs);

  const syncMeasuredHeight = useCallback((key: string, node: HTMLDivElement) => {
    const nextHeight = Math.ceil(node.getBoundingClientRect().height);
    if (nextHeight <= 0) {
      return;
    }

    setMeasuredHeights((current) =>
      current[key] === nextHeight ? current : { ...current, [key]: nextHeight }
    );
  }, []);

  const bindMeasuredHeight = useCallback(
    (key: string) => {
      const cachedCallback = refCallbacksRef.current.get(key);
      if (cachedCallback) {
        return cachedCallback;
      }

      const callback = createMeasuredHeightCallback({ ...refs, key, syncMeasuredHeight });

      refCallbacksRef.current.set(key, callback);
      return callback;
    },
    [refCallbacksRef, refs, syncMeasuredHeight]
  );

  return { bindMeasuredHeight, measuredHeights };
}

/**
 * Owns scroll, measurement, and visibility state for the virtualized scenario workspace.
 */
export function useScenarioWorkspaceVirtualization(steps: ScenarioStep[]) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);
  const { bindMeasuredHeight, measuredHeights } = useScenarioWorkspaceMeasurements();
  const { scrollTop, viewportHeight } = useScenarioWorkspaceViewport(scrollContainer);
  const setScrollContainerRef = useCallback((node: HTMLDivElement | null) => {
    scrollContainerRef.current = node;
    setScrollContainer(node);
  }, []);

  const workspaceWindow = useMemo(
    () => buildScenarioWorkspaceWindow(steps, measuredHeights),
    [measuredHeights, steps]
  );
  const visibleItems = useMemo(
    () =>
      resolveScenarioWorkspaceVisibleItems({
        window: workspaceWindow,
        scrollTop,
        viewportHeight,
      }),
    [scrollTop, viewportHeight, workspaceWindow]
  );

  return {
    bindMeasuredHeight,
    scrollContainerRef: setScrollContainerRef,
    scrollContainerNodeRef: scrollContainerRef,
    viewportHeight,
    visibleItems,
    workspaceWindow,
    workspaceHeight: Math.max(workspaceWindow.totalHeight, viewportHeight),
  };
}
