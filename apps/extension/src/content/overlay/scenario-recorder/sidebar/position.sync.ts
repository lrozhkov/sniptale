import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import { queryAllContentUiElements } from '../../../platform/dom-host';
import {
  resolveDefaultSidebarPosition,
  resolveScenarioRecorderSidebarPosition,
  type ScenarioRecorderSidebarPosition,
} from './position.helpers';
import { DEFAULT_SIDEBAR_TOP } from './position.state';

function arePositionsEqual(
  left: ScenarioRecorderSidebarPosition,
  right: ScenarioRecorderSidebarPosition
) {
  return left.x === right.x && left.y === right.y;
}

export function useSidebarPositionInitialization(args: {
  initializedRef: MutableRefObject<boolean>;
  setRequestedPosition: Dispatch<SetStateAction<ScenarioRecorderSidebarPosition>>;
  setResolvedPosition: Dispatch<SetStateAction<ScenarioRecorderSidebarPosition>>;
  sidebarRef: RefObject<HTMLElement | null>;
  visible: boolean;
}) {
  const { initializedRef, setRequestedPosition, setResolvedPosition, sidebarRef, visible } = args;

  useLayoutEffect(() => {
    if (!visible || initializedRef.current || !sidebarRef.current) {
      return;
    }

    const nextPosition = resolveDefaultSidebarPosition(sidebarRef.current, DEFAULT_SIDEBAR_TOP);
    initializedRef.current = true;
    setRequestedPosition(nextPosition);
    setResolvedPosition(nextPosition);
  }, [initializedRef, setRequestedPosition, setResolvedPosition, sidebarRef, visible]);
}

export function useSidebarResolvedPositionSync(args: {
  requestedPosition: ScenarioRecorderSidebarPosition;
  setResolvedPosition: Dispatch<SetStateAction<ScenarioRecorderSidebarPosition>>;
  sidebarRef: RefObject<HTMLElement | null>;
  visible: boolean;
}) {
  const { requestedPosition, setResolvedPosition, sidebarRef, visible } = args;
  const animationFrameRef = useRef<number | null>(null);

  const syncResolvedPosition = useCallback(() => {
    if (!sidebarRef.current) {
      return;
    }

    const nextPosition = resolveScenarioRecorderSidebarPosition({
      requestedPosition,
      sidebarRef,
    });
    setResolvedPosition((current) =>
      arePositionsEqual(current, nextPosition) ? current : nextPosition
    );
  }, [requestedPosition, setResolvedPosition, sidebarRef]);

  const scheduleResolvedPositionSync = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      syncResolvedPosition();
    });
  }, [syncResolvedPosition]);

  useLayoutEffect(() => {
    if (!visible || !sidebarRef.current) {
      return;
    }

    syncResolvedPosition();
  }, [sidebarRef, syncResolvedPosition, visible]);

  return { animationFrameRef, scheduleResolvedPositionSync };
}

function resolveSidebarObserverTargets(sidebarElement: HTMLElement) {
  const rootNode = sidebarElement.getRootNode();
  const observerTarget =
    rootNode instanceof ShadowRoot || rootNode instanceof HTMLElement ? rootNode : document.body;
  const floatingBlockers = queryAllContentUiElements<HTMLElement>(
    '[data-ui="content.toolbar.root"], .sniptale-popover-menu'
  ).filter((element) => element !== sidebarElement);

  return { floatingBlockers, observerTarget };
}

export function useSidebarFloatingObservers(args: {
  animationFrameRef: MutableRefObject<number | null>;
  scheduleResolvedPositionSync: () => void;
  sidebarRef: RefObject<HTMLElement | null>;
  visible: boolean;
}) {
  const { animationFrameRef, scheduleResolvedPositionSync, sidebarRef, visible } = args;

  useEffect(() => {
    if (!visible || !sidebarRef.current) {
      return;
    }

    const { floatingBlockers, observerTarget } = resolveSidebarObserverTargets(sidebarRef.current);
    const mutationObserver = new MutationObserver(scheduleResolvedPositionSync);
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(scheduleResolvedPositionSync);

    mutationObserver.observe(observerTarget, {
      childList: true,
      subtree: false,
    });
    floatingBlockers.forEach((element) => {
      mutationObserver.observe(element, {
        attributes: true,
        attributeFilter: ['style', 'class', 'data-menu-open', 'aria-expanded'],
      });
    });
    resizeObserver?.observe(sidebarRef.current);
    floatingBlockers.forEach((element) => resizeObserver?.observe(element));

    window.addEventListener('resize', scheduleResolvedPositionSync);
    document.addEventListener('scroll', scheduleResolvedPositionSync, true);

    return () => {
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleResolvedPositionSync);
      document.removeEventListener('scroll', scheduleResolvedPositionSync, true);
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [animationFrameRef, scheduleResolvedPositionSync, sidebarRef, visible]);
}
