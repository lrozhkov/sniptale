import React from 'react';
import type { CSSProperties } from 'react';
import { bindFloatingInteractionPositionListeners } from '@sniptale/ui/floating-interactions/placement';
import { queryAllContentUiElements } from '../../../platform/dom-host';
import { readContentUiScaleCompensation } from '@sniptale/ui/floating-interactions/scale';
import type { FloatingRect } from './floating-placement';
import {
  FrameAnnotationPopoverMeasurementContext,
  resolveFrameAnnotationPopoverDirection,
} from '../../../../composition/frame-annotation-controls/popover/position';

const VIEWPORT_MARGIN = 8;
const FRAME_TOOLBAR_POPOVER_GAP = 4;
const TOOLBAR_MENU_GAP = 10;
const measuredPopoverSizes = new WeakMap<HTMLElement, { width: number; height: number }>();

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
  alignToAnchor: boolean;
  anchorRect: FloatingRect;
  avoidRect?: FloatingRect;
  height: number;
  viewport: { width: number; height: number };
  width: number;
  uiScale: number;
}): FloatingRect | null {
  const viewportMargin = VIEWPORT_MARGIN * params.uiScale;
  const toolbarMenuGap = TOOLBAR_MENU_GAP * params.uiScale;
  const targetRect = params.avoidRect ?? params.anchorRect;
  const rightX =
    Math.max(params.anchorRect.x + params.anchorRect.width, targetRect.x + targetRect.width) +
    toolbarMenuGap;
  const leftX = Math.min(params.anchorRect.x, targetRect.x) - toolbarMenuGap - params.width;
  const maxY = Math.max(viewportMargin, params.viewport.height - params.height - viewportMargin);
  const y = clamp(
    params.alignToAnchor
      ? params.anchorRect.y
      : targetRect.y + targetRect.height / 2 - params.height / 2,
    viewportMargin,
    maxY
  );
  const centeredX = clamp(
    targetRect.x + targetRect.width / 2 - params.width / 2,
    viewportMargin,
    params.viewport.width - params.width - viewportMargin
  );
  const candidates = [
    { x: rightX, y, width: params.width, height: params.height },
    { x: leftX, y, width: params.width, height: params.height },
    {
      x: centeredX,
      y: targetRect.y + targetRect.height + toolbarMenuGap,
      width: params.width,
      height: params.height,
    },
    {
      x: centeredX,
      y: targetRect.y - toolbarMenuGap - params.height,
      width: params.width,
      height: params.height,
    },
  ];
  return (
    candidates.find((candidate) => isInsideViewport(candidate, params.viewport, viewportMargin)) ??
    null
  );
}

function calculateCanonicalPopoverRect(params: {
  alignQuickControlToAnchor: boolean;
  anchorRect: FloatingRect;
  avoidRect?: FloatingRect;
  preferSidePlacement: boolean;
  surfaceRect: FloatingRect;
  size: { width: number; height: number };
  viewport: { width: number; height: number };
  uiScale: number;
}): FloatingRect {
  const viewportMargin = VIEWPORT_MARGIN * params.uiScale;
  const width = Math.min(
    params.size.width,
    Math.max(0, params.viewport.width - viewportMargin * 2)
  );
  const height = params.size.height;
  const gap =
    (params.preferSidePlacement ? TOOLBAR_MENU_GAP : FRAME_TOOLBAR_POPOVER_GAP) * params.uiScale;
  if (params.preferSidePlacement) {
    const sideRect = calculateQuickControlPopoverRect({
      alignToAnchor: params.alignQuickControlToAnchor,
      anchorRect: params.anchorRect,
      ...(params.avoidRect ? { avoidRect: params.avoidRect } : {}),
      height,
      viewport: params.viewport,
      width,
      uiScale: params.uiScale,
    });
    if (sideRect) return sideRect;
  }

  const x = clamp(
    params.anchorRect.x + params.anchorRect.width / 2 - width / 2,
    viewportMargin,
    params.viewport.width - width - viewportMargin
  );
  const bottomY = params.surfaceRect.y + params.surfaceRect.height + gap;
  const bottomAvailable = Math.max(0, params.viewport.height - viewportMargin - bottomY);
  const placeBelow = height <= bottomAvailable;
  const preferredY = placeBelow ? bottomY : params.surfaceRect.y - gap - height;
  const y = clamp(
    preferredY,
    viewportMargin,
    Math.max(viewportMargin, params.viewport.height - height - viewportMargin)
  );
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
  viewport: { width: number; height: number },
  margin = VIEWPORT_MARGIN
): boolean {
  return (
    rect.x >= margin &&
    rect.y >= margin &&
    rect.x + rect.width <= viewport.width - margin &&
    rect.y + rect.height <= viewport.height - margin
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
  uiScale: number;
}): FloatingRect {
  const viewportMargin = VIEWPORT_MARGIN * params.uiScale;
  const toolbarMenuGap = TOOLBAR_MENU_GAP * params.uiScale;
  const width = Math.min(
    params.size.width,
    Math.max(0, params.viewport.width - viewportMargin * 2)
  );
  const height = params.size.height;
  const horizontalX = clamp(
    params.anchorRect.x,
    viewportMargin,
    params.viewport.width - width - viewportMargin
  );
  const verticalY = clamp(
    params.anchorRect.y,
    viewportMargin,
    params.viewport.height - height - viewportMargin
  );
  const downEdge = Math.max(
    params.toolbarRect.y + params.toolbarRect.height,
    params.anchorRect.y + params.anchorRect.height + toolbarMenuGap
  );
  const upEdge = Math.min(params.toolbarRect.y, params.anchorRect.y - toolbarMenuGap);
  const rightEdge = Math.max(
    params.toolbarRect.x + params.toolbarRect.width,
    params.anchorRect.x + params.anchorRect.width + toolbarMenuGap
  );
  const leftEdge = Math.min(params.toolbarRect.x, params.anchorRect.x - toolbarMenuGap);
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
  const fitting = orderedCandidates.find((candidate) =>
    isInsideViewport(candidate, params.viewport, viewportMargin)
  );
  if (fitting) return fitting;
  const availableCandidates = orderedCandidates.map((candidate) => {
    const availableHeight =
      candidate === candidates.down
        ? params.viewport.height - viewportMargin - downEdge
        : candidate === candidates.up
          ? upEdge - viewportMargin
          : params.viewport.height - viewportMargin * 2;
    const available = { ...candidate, height: Math.max(0, Math.min(height, availableHeight)) };
    available.y =
      candidate === candidates.up
        ? upEdge - available.height
        : candidate === candidates.down
          ? downEdge
          : clamp(
              candidate.y,
              viewportMargin,
              params.viewport.height - available.height - viewportMargin
            );
    return available;
  });
  const usable = availableCandidates.filter(
    (candidate) =>
      isInsideViewport(candidate, params.viewport, viewportMargin) &&
      !rectsOverlap(candidate, params.toolbarRect) &&
      !rectsOverlap(candidate, params.anchorRect)
  );
  return usable.reduce(
    (largest, candidate) => (candidate.height > largest.height ? candidate : largest),
    usable[0] ?? availableCandidates[0]!
  );
}

/** Predict the main-toolbar side with the existing placement policy and latest measured size. */
export function resolveMainToolbarFramePopoverDirection(
  anchorEl: HTMLElement | null,
  fallbackSize: { width: number; height: number }
) {
  const mainToolbar = getMainToolbar(anchorEl);
  if (!anchorEl || !mainToolbar) return undefined;
  const uiScale = readContentUiScaleCompensation(anchorEl);
  const layoutSize = measuredPopoverSizes.get(anchorEl) ?? fallbackSize;
  const rect = calculateMainToolbarPopoverRect({
    anchorRect: toRect(anchorEl.getBoundingClientRect()),
    displayMode: mainToolbar.displayMode,
    size: { width: layoutSize.width * uiScale, height: layoutSize.height * uiScale },
    toolbarRect: mainToolbar.rect,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    uiScale,
  });
  return resolveFrameAnnotationPopoverDirection(anchorEl.getBoundingClientRect(), {
    left: rect.x,
    top: rect.y,
    width: rect.width,
  });
}

function readPopoverLayoutSize(
  popover: HTMLDivElement,
  mainToolbar: ReturnType<typeof getMainToolbar>
) {
  const body = mainToolbar
    ? popover.querySelector<HTMLElement>(':scope > .sniptale-content-popover-body')
    : undefined;
  return {
    width: popover.offsetWidth,
    height: body
      ? Math.max(popover.offsetHeight, popover.offsetHeight - body.clientHeight + body.scrollHeight)
      : popover.offsetHeight,
  };
}

interface FramePopoverPlacementSession {
  anchorEl: HTMLElement;
  anchorRect: FloatingRect;
  frameId: string;
  preferSidePlacement: boolean;
  resolvedRect?: FloatingRect;
  surfaceRect: FloatingRect;
  uiScale: number;
}

function resolveFramePopoverPlacement(params: {
  session: FramePopoverPlacementSession;
  anchorRect: FloatingRect;
  alignQuickControlToAnchor: boolean;
  avoidRect: FloatingRect | undefined;
  mainToolbar: ReturnType<typeof getMainToolbar>;
  size: { width: number; height: number };
  viewport: { width: number; height: number };
  uiScale: number;
}) {
  const {
    session,
    anchorRect,
    alignQuickControlToAnchor,
    avoidRect,
    mainToolbar,
    size,
    viewport,
    uiScale,
  } = params;
  const calculatedRect = mainToolbar
    ? calculateMainToolbarPopoverRect({
        anchorRect,
        displayMode: mainToolbar.displayMode,
        size,
        toolbarRect: mainToolbar.rect,
        viewport,
        uiScale,
      })
    : calculateCanonicalPopoverRect({
        alignQuickControlToAnchor,
        anchorRect: session.anchorRect,
        ...(avoidRect ? { avoidRect } : {}),
        preferSidePlacement: session.preferSidePlacement,
        surfaceRect: session.surfaceRect,
        size,
        viewport,
        uiScale,
      });
  const previousRect = session.resolvedRect;
  const previousSizedRect = previousRect
    ? { ...previousRect, width: size.width, height: size.height }
    : undefined;
  const keepPreviousPosition =
    !mainToolbar &&
    session.preferSidePlacement &&
    previousSizedRect !== undefined &&
    isInsideViewport(previousSizedRect, viewport, VIEWPORT_MARGIN * uiScale) &&
    (avoidRect === undefined || !rectsOverlap(previousSizedRect, avoidRect));
  return keepPreviousPosition ? previousSizedRect : calculatedRect;
}

export function useFramePopoverPosition(params: {
  anchorEl: HTMLElement | null;
  fallbackSize: { width: number; height: number };
  frameId: string;
  frameRect: FloatingRect;
  isOpen: boolean;
  popoverRef: React.RefObject<HTMLDivElement | null>;
  quickControlPlacement?: 'anchor-aligned' | 'callout-aware' | 'frame-aware';
}) {
  const onMeasured = React.useContext(FrameAnnotationPopoverMeasurementContext);
  const [, refresh] = React.useReducer((value) => value + 1, 0);
  React.useLayoutEffect(() => {
    const popover = params.popoverRef.current;
    if (
      !onMeasured ||
      !params.isOpen ||
      !params.anchorEl ||
      !popover?.offsetWidth ||
      !popover.offsetHeight
    )
      return;
    const size = readPopoverLayoutSize(popover, getMainToolbar(params.anchorEl));
    const previous = measuredPopoverSizes.get(params.anchorEl);
    if (previous?.width === size.width && previous.height === size.height) return;
    measuredPopoverSizes.set(params.anchorEl, size);
    onMeasured?.();
  });
  const uiScale = readContentUiScaleCompensation(params.anchorEl);
  const placementSessionRef = React.useRef<FramePopoverPlacementSession | null>(null);
  const placementSession = placementSessionRef.current;

  if (!params.isOpen) {
    placementSessionRef.current = null;
  } else if (
    params.anchorEl &&
    (!placementSession ||
      placementSession.anchorEl !== params.anchorEl ||
      placementSession.frameId !== params.frameId ||
      placementSession.uiScale !== uiScale)
  ) {
    const anchorRect = toRect(params.anchorEl.getBoundingClientRect());
    placementSessionRef.current = {
      anchorEl: params.anchorEl,
      anchorRect,
      frameId: params.frameId,
      preferSidePlacement: !params.anchorEl.closest('.sniptale-toolbar-portal-wrapper'),
      surfaceRect: getToolbarRect(params.frameId) ?? anchorRect,
      uiScale,
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
  const mainToolbar = getMainToolbar(params.anchorEl);
  const layoutSize =
    popover && popover.offsetWidth > 0 && popover.offsetHeight > 0
      ? readPopoverLayoutSize(popover, mainToolbar)
      : params.fallbackSize;
  const size = { width: layoutSize.width * uiScale, height: layoutSize.height * uiScale };
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const avoidRect = activePlacementSession.preferSidePlacement
    ? params.quickControlPlacement === 'anchor-aligned'
      ? undefined
      : params.quickControlPlacement === 'frame-aware'
        ? params.frameRect
        : getCalloutAvoidanceRect(params.frameId)
    : undefined;
  const rect = resolveFramePopoverPlacement({
    session: activePlacementSession,
    anchorRect: mainToolbar
      ? toRect(params.anchorEl.getBoundingClientRect())
      : activePlacementSession.anchorRect,
    alignQuickControlToAnchor: params.quickControlPlacement === 'anchor-aligned',
    avoidRect,
    mainToolbar,
    size,
    viewport,
    uiScale,
  });
  activePlacementSession.resolvedRect = rect;
  return {
    position: 'fixed',
    top: rect.y,
    left: rect.x,
    maxWidth: 'calc(var(--sniptale-content-ui-viewport-width) - 16px)',
    maxHeight: 'none',
    ...(mainToolbar && rect.height < size.height
      ? { '--sniptale-main-toolbar-popover-max-height': `${rect.height / uiScale}px` }
      : {}),
    overflow: 'visible',
    zIndex: 2147483647,
    pointerEvents: 'auto',
  } satisfies CSSProperties;
}
