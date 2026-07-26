import { resolvePagePreparationTarget } from '../../parser/page-preparation/target';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { HoverOverlayActions } from './overlay';
import type { HoverFrameCacheSession, HoverSession, HoverTrackingSession } from './session';
import type { AddFreeFrameCallback } from '../../../features/highlighter/contracts';
import { getViewportClientPoint } from '../../platform/frame';
import {
  hasBlockingHighlighterPopover,
  isInsideExistingFrame,
  isHighlighterExtensionUiElement,
  isNearExistingFrameBorder,
} from './targets';

const clickLogger = createLogger({ namespace: 'ContentHighlighter:HoverPreviewClick' });
const eventsLogger = createLogger({ namespace: 'ContentHighlighter:HoverPreviewEvents' });
const interactionLogger = createLogger({
  namespace: 'ContentHighlighter:HoverPreviewInteractions',
});

export type HighlighterCallbacks = {
  addFrame: ((element: HTMLElement) => void) | null;
  addFreeFrame?: AddFreeFrameCallback | null;
  hasFrameForElement: ((element: HTMLElement) => boolean) | null;
};

export type HighlighterStateGetters = {
  isModeEnabled: () => boolean;
  isPaused: () => boolean;
  isFrameEditing: () => boolean;
};

type HoverInteractionSession = HoverTrackingSession &
  HoverFrameCacheSession &
  Pick<HoverSession, 'freeDraw'>;

type HoverInteractionProps = {
  getCallbacks: () => HighlighterCallbacks;
  getState: HighlighterStateGetters;
  hoverThrottleMs: number;
  overlayActions: Pick<HoverOverlayActions, 'hideHoverOverlay' | 'showHoverOverlay'>;
  session: HoverInteractionSession;
  consumeSuppressedClick?: (event: MouseEvent) => boolean;
};

export function shouldSkipHoverProcessing(props: {
  event: MouseEvent;
  getState: HighlighterStateGetters;
  hoverThrottleMs: number;
  session: Pick<HoverTrackingSession, 'lastHoverProcessTime' | 'lastHoverX' | 'lastHoverY'>;
}): boolean {
  if (
    !props.getState.isModeEnabled() ||
    props.getState.isPaused() ||
    props.getState.isFrameEditing()
  ) {
    return true;
  }
  const dx = Math.abs(props.event.clientX - props.session.lastHoverX);
  const dy = Math.abs(props.event.clientY - props.session.lastHoverY);
  if (dx < 2 && dy < 2) return true;
  return Date.now() - props.session.lastHoverProcessTime < props.hoverThrottleMs;
}

export function handleFrozenHoverPreview(props: {
  event: MouseEvent;
  hideHoverOverlay: () => void;
  session: Pick<
    HoverTrackingSession,
    'isHoverPreviewFrozen' | 'lastHoverTarget' | 'lastHoverX' | 'lastHoverY'
  >;
}): boolean {
  if (!props.session.isHoverPreviewFrozen) return false;
  props.session.isHoverPreviewFrozen = false;
  props.hideHoverOverlay();
  props.session.lastHoverTarget = null;
  props.session.lastHoverX = props.event.clientX;
  props.session.lastHoverY = props.event.clientY;
  eventsLogger.debug('Unfroze hover preview after mouse movement');
  return true;
}

export function shouldIgnoreHighlighterClick(props: {
  eventTarget: HTMLElement;
  getState: Pick<HighlighterStateGetters, 'isModeEnabled' | 'isPaused'>;
}): boolean {
  if (!props.getState.isModeEnabled() || props.getState.isPaused()) {
    return true;
  }
  if (hasBlockingHighlighterPopover()) return true;
  return isHighlighterExtensionUiElement(props.eventTarget);
}

function hideHoverPreview(
  session: Pick<HoverTrackingSession, 'lastHoverTarget'>,
  hideHoverOverlay: () => void
): void {
  hideHoverOverlay();
  session.lastHoverTarget = null;
}

function shouldSuppressHoverTarget(
  session: HoverFrameCacheSession,
  target: HTMLElement,
  x: number,
  y: number
): boolean {
  return (
    isHighlighterExtensionUiElement(target) ||
    isInsideExistingFrame(session, x, y) ||
    isNearExistingFrameBorder(session, x, y)
  );
}

function canShowHoverTarget(props: {
  getCallbacks: () => HighlighterCallbacks;
  session: Pick<HoverTrackingSession, 'lastHoverTarget'>;
  target: HTMLElement;
}): boolean {
  if (props.target === props.session.lastHoverTarget) return false;
  const { hasFrameForElement } = props.getCallbacks();
  return !(hasFrameForElement && hasFrameForElement(props.target));
}

function processScheduledHoverTarget(props: {
  getCallbacks: () => HighlighterCallbacks;
  getState: Pick<HighlighterStateGetters, 'isModeEnabled' | 'isPaused'>;
  hideHoverOverlay: () => void;
  session: HoverInteractionSession;
  showHoverOverlay: (element: HTMLElement) => void;
  target: HTMLElement;
  x: number;
  y: number;
}): void {
  if (!props.getState.isModeEnabled() || props.getState.isPaused()) return;
  if (hasBlockingHighlighterPopover()) {
    hideHoverPreview(props.session, props.hideHoverOverlay);
    return;
  }
  if (shouldSuppressHoverTarget(props.session, props.target, props.x, props.y)) {
    hideHoverPreview(props.session, props.hideHoverOverlay);
    return;
  }
  if (
    !canShowHoverTarget({
      getCallbacks: props.getCallbacks,
      session: props.session,
      target: props.target,
    })
  ) {
    if (props.session.lastHoverTarget !== props.target) {
      hideHoverPreview(props.session, props.hideHoverOverlay);
    }
    return;
  }
  props.showHoverOverlay(props.target);
  props.session.lastHoverTarget = props.target;
}

export function scheduleHoverOverlayUpdate(props: {
  event: MouseEvent;
  getCallbacks: () => HighlighterCallbacks;
  getState: Pick<HighlighterStateGetters, 'isModeEnabled' | 'isPaused'>;
  hideHoverOverlay: () => void;
  iframe?: HTMLIFrameElement;
  session: HoverInteractionSession;
  showHoverOverlay: (element: HTMLElement) => void;
}): void {
  if (props.session.hoverRafId !== null) return;
  props.session.lastHoverX = props.event.clientX;
  props.session.lastHoverY = props.event.clientY;
  props.session.lastHoverProcessTime = Date.now();

  const target = resolvePagePreparationTarget(props.event, props.iframe);
  if (!target) {
    hideHoverPreview(props.session, props.hideHoverOverlay);
    return;
  }
  const point = getViewportClientPoint(props.event.clientX, props.event.clientY, props.iframe);

  props.session.hoverRafId = requestAnimationFrame(() => {
    props.session.hoverRafId = null;
    if (props.session.freeDraw.gesture) return;
    processScheduledHoverTarget({
      getCallbacks: props.getCallbacks,
      getState: props.getState,
      hideHoverOverlay: props.hideHoverOverlay,
      session: props.session,
      showHoverOverlay: props.showHoverOverlay,
      target,
      x: point.x,
      y: point.y,
    });
  });
}

function createHoverClickHandler(props: HoverInteractionProps) {
  return (event: MouseEvent, iframe?: HTMLIFrameElement) => {
    if (props.consumeSuppressedClick?.(event)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }
    const target = resolvePagePreparationTarget(event, iframe);
    const point = getViewportClientPoint(event.clientX, event.clientY, iframe);
    if (
      !target ||
      isInsideExistingFrame(props.session, point.x, point.y) ||
      isNearExistingFrameBorder(props.session, point.x, point.y) ||
      shouldIgnoreHighlighterClick({ eventTarget: target, getState: props.getState })
    ) {
      return;
    }

    const srcStr = iframe?.src
      ? typeof iframe.src === 'string'
        ? iframe.src.substring(0, 30)
        : String(iframe.src).substring(0, 30)
      : '';
    const classStr = typeof target.className === 'string' ? target.className.substring(0, 30) : '';
    clickLogger.debug(
      'Handling hover-preview click',
      iframe ? `(iframe: ${iframe.id || srcStr})` : '(top-level)',
      'target:',
      target.tagName,
      classStr
    );
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const elementForFrame = props.session.lastHoverTarget || target;
    const { addFrame, hasFrameForElement } = props.getCallbacks();
    if (hasFrameForElement?.(elementForFrame)) {
      clickLogger.debug('Blocked duplicate frame creation');
      return;
    }
    if (elementForFrame.nodeType === Node.ELEMENT_NODE && addFrame) {
      addFrame(elementForFrame);
      props.session.isHoverPreviewFrozen = true;
      props.overlayActions.hideHoverOverlay();
      props.session.lastHoverTarget = null;
      clickLogger.debug('Froze hover preview after creating a frame');
    }
  };
}

function createHoverMouseMoveHandler(props: HoverInteractionProps) {
  return (event: MouseEvent, iframe?: HTMLIFrameElement) => {
    if (props.session.freeDraw.gesture) return;
    if (hasBlockingHighlighterPopover()) {
      if (props.session.hoverRafId !== null) {
        cancelAnimationFrame(props.session.hoverRafId);
        props.session.hoverRafId = null;
      }
      hideHoverPreview(props.session, props.overlayActions.hideHoverOverlay);
      return;
    }
    if (
      shouldSkipHoverProcessing({
        event,
        getState: props.getState,
        hoverThrottleMs: props.hoverThrottleMs,
        session: props.session,
      })
    ) {
      return;
    }
    if (
      handleFrozenHoverPreview({
        event,
        hideHoverOverlay: props.overlayActions.hideHoverOverlay,
        session: props.session,
      })
    ) {
      return;
    }
    scheduleHoverOverlayUpdate({
      event,
      getCallbacks: props.getCallbacks,
      getState: props.getState,
      hideHoverOverlay: props.overlayActions.hideHoverOverlay,
      session: props.session,
      showHoverOverlay: props.overlayActions.showHoverOverlay,
      ...(iframe === undefined ? {} : { iframe }),
    });
  };
}

export function createHoverInteractionHandlers(props: HoverInteractionProps) {
  const handleMouseMove = createHoverMouseMoveHandler(props);
  const handleClick = createHoverClickHandler(props);
  return {
    handleClick,
    handleMouseMove,
    handleMouseLeave: () => {
      if (!props.getState.isModeEnabled()) return;
      if (props.session.hoverRafId !== null) {
        cancelAnimationFrame(props.session.hoverRafId);
        props.session.hoverRafId = null;
      }
      hideHoverPreview(props.session, props.overlayActions.hideHoverOverlay);
      interactionLogger.debug('Hidden hover preview after leaving the viewport');
    },
    cancelPendingHoverFrame: () => {
      if (props.session.hoverRafId !== null) {
        cancelAnimationFrame(props.session.hoverRafId);
        props.session.hoverRafId = null;
      }
    },
    clearHoverTracking: () => {
      props.session.lastHoverTarget = null;
      props.session.lastHoverX = -1;
      props.session.lastHoverY = -1;
    },
  };
}
