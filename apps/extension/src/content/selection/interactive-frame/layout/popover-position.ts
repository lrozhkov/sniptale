import React from 'react';
import type { CSSProperties } from 'react';
import { bindFloatingInteractionPositionListeners } from '@sniptale/ui/floating-interactions/placement';
import { queryAllContentUiElements } from '../../../platform/dom-host';
import type { FloatingRect } from './floating-placement';

const VIEWPORT_MARGIN = 8;
const POPOVER_GAP = 10;

function toRect(rect: DOMRect): FloatingRect {
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

function getToolbarRect(frameId: string): FloatingRect | undefined {
  const toolbar = queryAllContentUiElements('.sniptale-toolbar-portal-wrapper').find(
    (element) => element instanceof HTMLElement && element.dataset['frameId'] === frameId
  );
  return toolbar instanceof HTMLElement ? toRect(toolbar.getBoundingClientRect()) : undefined;
}

function getHiddenStyle(): CSSProperties {
  return {
    position: 'fixed',
    top: 0,
    left: 0,
    visibility: 'hidden',
    pointerEvents: 'none',
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function calculateCanonicalPopoverRect(params: {
  anchorRect: FloatingRect;
  surfaceRect: FloatingRect;
  size: { width: number; height: number };
  viewport: { width: number; height: number };
}): FloatingRect {
  const width = Math.min(
    params.size.width,
    Math.max(0, params.viewport.width - VIEWPORT_MARGIN * 2)
  );
  const height = params.size.height;
  const x = clamp(
    params.anchorRect.x + params.anchorRect.width / 2 - width / 2,
    VIEWPORT_MARGIN,
    params.viewport.width - width - VIEWPORT_MARGIN
  );
  const bottomY = params.surfaceRect.y + params.surfaceRect.height + POPOVER_GAP;
  const bottomAvailable = Math.max(0, params.viewport.height - VIEWPORT_MARGIN - bottomY);
  const placeBelow = height <= bottomAvailable;
  const y = placeBelow ? bottomY : params.surfaceRect.y - POPOVER_GAP - height;
  return { x, y, width, height };
}

export function useFramePopoverPosition(params: {
  anchorEl: HTMLElement | null;
  fallbackSize: { width: number; height: number };
  frameId: string;
  frameRect: FloatingRect;
  isOpen: boolean;
  popoverRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [, refresh] = React.useReducer((value) => value + 1, 0);
  const placementSessionRef = React.useRef<{
    anchorEl: HTMLElement;
    anchorRect: FloatingRect;
    frameId: string;
    surfaceRect: FloatingRect;
  } | null>(null);
  const placementSession = placementSessionRef.current;

  if (!params.isOpen) {
    placementSessionRef.current = null;
  } else if (
    params.anchorEl &&
    (!placementSession ||
      placementSession.anchorEl !== params.anchorEl ||
      placementSession.frameId !== params.frameId)
  ) {
    const anchorRect = toRect(params.anchorEl.getBoundingClientRect());
    placementSessionRef.current = {
      anchorEl: params.anchorEl,
      anchorRect,
      frameId: params.frameId,
      surfaceRect: getToolbarRect(params.frameId) ?? anchorRect,
    };
  }

  React.useLayoutEffect(() => {
    if (!params.isOpen) return;
    const update = () => refresh();
    const cleanupPosition = bindFloatingInteractionPositionListeners(params.anchorEl, update);
    const popover = params.popoverRef.current;
    if (!popover) return cleanupPosition;
    if (typeof ResizeObserver === 'undefined') return cleanupPosition;
    let layoutRafId: number | null = null;
    const updateAfterLayout = () => {
      if (layoutRafId !== null) return;
      layoutRafId = requestAnimationFrame(() => {
        layoutRafId = null;
        update();
      });
    };
    const observer = new ResizeObserver(updateAfterLayout);
    observer.observe(popover);
    const toolbar = queryAllContentUiElements('.sniptale-toolbar-portal-wrapper').find(
      (element) => element instanceof HTMLElement && element.dataset['frameId'] === params.frameId
    );
    if (toolbar) observer.observe(toolbar);
    return () => {
      observer.disconnect();
      if (layoutRafId !== null) cancelAnimationFrame(layoutRafId);
      cleanupPosition?.();
    };
  }, [
    params.anchorEl,
    params.frameRect.height,
    params.frameRect.width,
    params.frameRect.x,
    params.frameRect.y,
    params.frameId,
    params.isOpen,
    params.popoverRef,
  ]);

  if (!params.anchorEl) return getHiddenStyle();
  const activePlacementSession = placementSessionRef.current;
  if (!activePlacementSession) return getHiddenStyle();
  const popover = params.popoverRef.current;
  const size =
    popover && popover.offsetWidth > 0 && popover.offsetHeight > 0
      ? { width: popover.offsetWidth, height: popover.offsetHeight }
      : params.fallbackSize;
  const rect = calculateCanonicalPopoverRect({
    anchorRect: activePlacementSession.anchorRect,
    surfaceRect: activePlacementSession.surfaceRect,
    size,
    viewport: { width: window.innerWidth, height: window.innerHeight },
  });
  return {
    position: 'fixed',
    top: rect.y,
    left: rect.x,
    maxWidth: 'calc(100vw - 16px)',
    maxHeight: 'none',
    overflow: 'visible',
    zIndex: 2147483647,
    pointerEvents: 'auto',
  } satisfies CSSProperties;
}
