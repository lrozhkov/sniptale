import React from 'react';
import type { CSSProperties } from 'react';
import { bindFloatingInteractionPositionListeners } from '@sniptale/ui/floating-interactions/placement';
import { queryAllContentUiElements } from '../../../platform/dom-host';
import type { FloatingRect } from './floating-placement';

const VIEWPORT_MARGIN = 8;
const FRAME_TOOLBAR_POPOVER_GAP = 4;
const TOOLBAR_MENU_GAP = 10;

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

function getMainToolbar(anchorEl: HTMLElement | null): {
  displayMode: 'horizontal' | 'vertical';
  rect: FloatingRect;
} | null {
  const toolbar = anchorEl?.closest<HTMLElement>('.sniptale-toolbar');
  if (!toolbar) return null;
  return {
    displayMode: toolbar.dataset['displayMode'] === 'vertical' ? 'vertical' : 'horizontal',
    rect: toRect(toolbar.getBoundingClientRect()),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function calculateQuickControlPopoverRect(params: {
  anchorRect: FloatingRect;
  avoidRect?: FloatingRect;
  height: number;
  viewport: { width: number; height: number };
  width: number;
}): FloatingRect | null {
  const targetRect = params.avoidRect ?? params.anchorRect;
  const rightX =
    Math.max(params.anchorRect.x + params.anchorRect.width, targetRect.x + targetRect.width) +
    TOOLBAR_MENU_GAP;
  const leftX = Math.min(params.anchorRect.x, targetRect.x) - TOOLBAR_MENU_GAP - params.width;
  const maxY = Math.max(VIEWPORT_MARGIN, params.viewport.height - params.height - VIEWPORT_MARGIN);
  const y = clamp(targetRect.y + targetRect.height / 2 - params.height / 2, VIEWPORT_MARGIN, maxY);
  const centeredX = clamp(
    targetRect.x + targetRect.width / 2 - params.width / 2,
    VIEWPORT_MARGIN,
    params.viewport.width - params.width - VIEWPORT_MARGIN
  );
  const candidates = [
    { x: rightX, y, width: params.width, height: params.height },
    { x: leftX, y, width: params.width, height: params.height },
    {
      x: centeredX,
      y: targetRect.y + targetRect.height + TOOLBAR_MENU_GAP,
      width: params.width,
      height: params.height,
    },
    {
      x: centeredX,
      y: targetRect.y - TOOLBAR_MENU_GAP - params.height,
      width: params.width,
      height: params.height,
    },
  ];
  return candidates.find((candidate) => isInsideViewport(candidate, params.viewport)) ?? null;
}

function calculateCanonicalPopoverRect(params: {
  anchorRect: FloatingRect;
  avoidRect?: FloatingRect;
  preferSidePlacement: boolean;
  surfaceRect: FloatingRect;
  size: { width: number; height: number };
  viewport: { width: number; height: number };
}): FloatingRect {
  const width = Math.min(
    params.size.width,
    Math.max(0, params.viewport.width - VIEWPORT_MARGIN * 2)
  );
  const height = params.size.height;
  const gap = params.preferSidePlacement ? TOOLBAR_MENU_GAP : FRAME_TOOLBAR_POPOVER_GAP;
  if (params.preferSidePlacement) {
    const sideRect = calculateQuickControlPopoverRect({
      anchorRect: params.anchorRect,
      ...(params.avoidRect ? { avoidRect: params.avoidRect } : {}),
      height,
      viewport: params.viewport,
      width,
    });
    if (sideRect) return sideRect;
  }

  const x = clamp(
    params.anchorRect.x + params.anchorRect.width / 2 - width / 2,
    VIEWPORT_MARGIN,
    params.viewport.width - width - VIEWPORT_MARGIN
  );
  const bottomY = params.surfaceRect.y + params.surfaceRect.height + gap;
  const bottomAvailable = Math.max(0, params.viewport.height - VIEWPORT_MARGIN - bottomY);
  const placeBelow = height <= bottomAvailable;
  const y = placeBelow ? bottomY : params.surfaceRect.y - gap - height;
  return { x, y, width, height };
}

function getCalloutAvoidanceRect(frameId: string): FloatingRect | undefined {
  const callout = queryAllContentUiElements('.sniptale-callout').find(
    (element) => element instanceof HTMLElement && element.dataset['frameId'] === frameId
  );
  if (!(callout instanceof HTMLElement)) return undefined;
  const rects = [callout, ...callout.querySelectorAll('.sniptale-callout-dynamic-tail')].map(
    (element) => toRect(element.getBoundingClientRect())
  );
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function isInsideViewport(
  rect: FloatingRect,
  viewport: { width: number; height: number }
): boolean {
  return (
    rect.x >= VIEWPORT_MARGIN &&
    rect.y >= VIEWPORT_MARGIN &&
    rect.x + rect.width <= viewport.width - VIEWPORT_MARGIN &&
    rect.y + rect.height <= viewport.height - VIEWPORT_MARGIN
  );
}

function rectsOverlap(left: FloatingRect, right: FloatingRect): boolean {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.height <= right.y ||
    right.y + right.height <= left.y
  );
}

function calculateMainToolbarPopoverRect(params: {
  anchorRect: FloatingRect;
  displayMode: 'horizontal' | 'vertical';
  size: { width: number; height: number };
  toolbarRect: FloatingRect;
  viewport: { width: number; height: number };
}): FloatingRect {
  const width = Math.min(
    params.size.width,
    Math.max(0, params.viewport.width - VIEWPORT_MARGIN * 2)
  );
  const height = params.size.height;
  const horizontalX = clamp(
    params.anchorRect.x,
    VIEWPORT_MARGIN,
    params.viewport.width - width - VIEWPORT_MARGIN
  );
  const verticalY = clamp(
    params.anchorRect.y,
    VIEWPORT_MARGIN,
    params.viewport.height - height - VIEWPORT_MARGIN
  );
  const downEdge = Math.max(
    params.toolbarRect.y + params.toolbarRect.height,
    params.anchorRect.y + params.anchorRect.height + TOOLBAR_MENU_GAP
  );
  const upEdge = Math.min(params.toolbarRect.y, params.anchorRect.y - TOOLBAR_MENU_GAP);
  const rightEdge = Math.max(
    params.toolbarRect.x + params.toolbarRect.width,
    params.anchorRect.x + params.anchorRect.width + TOOLBAR_MENU_GAP
  );
  const leftEdge = Math.min(params.toolbarRect.x, params.anchorRect.x - TOOLBAR_MENU_GAP);
  const candidates = {
    down: {
      x: horizontalX,
      y: downEdge,
      width,
      height,
    },
    up: {
      x: horizontalX,
      y: upEdge - height,
      width,
      height,
    },
    right: {
      x: rightEdge,
      y: verticalY,
      width,
      height,
    },
    left: {
      x: leftEdge - width,
      y: verticalY,
      width,
      height,
    },
  } satisfies Record<string, FloatingRect>;
  const orderedCandidates =
    params.displayMode === 'vertical'
      ? [candidates.right, candidates.left, candidates.down, candidates.up]
      : [candidates.down, candidates.up, candidates.right, candidates.left];
  return (
    orderedCandidates.find((candidate) => isInsideViewport(candidate, params.viewport)) ??
    orderedCandidates[0]!
  );
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
    preferSidePlacement: boolean;
    resolvedRect?: FloatingRect;
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
      preferSidePlacement: !params.anchorEl.closest('.sniptale-toolbar-portal-wrapper'),
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
    const toolbar =
      params.anchorEl?.closest('.sniptale-toolbar') ??
      queryAllContentUiElements('.sniptale-toolbar-portal-wrapper').find(
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
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const mainToolbar = getMainToolbar(params.anchorEl);
  const avoidRect = activePlacementSession.preferSidePlacement
    ? getCalloutAvoidanceRect(params.frameId)
    : undefined;
  const calculatedRect = mainToolbar
    ? calculateMainToolbarPopoverRect({
        anchorRect: toRect(params.anchorEl.getBoundingClientRect()),
        displayMode: mainToolbar.displayMode,
        size,
        toolbarRect: mainToolbar.rect,
        viewport,
      })
    : calculateCanonicalPopoverRect({
        anchorRect: activePlacementSession.anchorRect,
        ...(avoidRect ? { avoidRect } : {}),
        preferSidePlacement: activePlacementSession.preferSidePlacement,
        surfaceRect: activePlacementSession.surfaceRect,
        size,
        viewport,
      });
  const previousRect = activePlacementSession.resolvedRect;
  const previousSizedRect = previousRect
    ? { ...previousRect, width: size.width, height: size.height }
    : undefined;
  const keepPreviousPosition =
    activePlacementSession.preferSidePlacement &&
    previousSizedRect !== undefined &&
    (avoidRect === undefined || !rectsOverlap(previousSizedRect, avoidRect));
  const rect = keepPreviousPosition ? previousSizedRect : calculatedRect;
  activePlacementSession.resolvedRect = rect;
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
