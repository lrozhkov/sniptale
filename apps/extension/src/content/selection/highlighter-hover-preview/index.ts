import { getAccessibleIframes } from '../../platform/frame';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  createHoverInteractionHandlers,
  type HighlighterCallbacks,
  type HighlighterStateGetters,
} from './interactions';
import { createHoverOverlayActions } from './overlay';
import { createHoverSession, invalidateHoverFrameCache } from './session';
import { createFreeFrameDrawingHandlers, type DrawingCancelReason } from './drawing';

const logger = createLogger({ namespace: 'ContentHighlighter:HoverPreview' });

export interface HoverController {
  overlay: {
    createContainer: () => void;
    removeContainer: () => void;
    createPreview: () => void;
    removePreview: () => void;
    hidePreview: () => void;
  };
  invalidation: {
    frameCache: () => void;
  };
  input: {
    dragStart: (event: DragEvent, iframe?: HTMLIFrameElement) => void;
    mouseDown: (event: MouseEvent) => void;
    mouseMove: (event: MouseEvent, iframe?: HTMLIFrameElement) => void;
    mouseLeave: () => void;
    click: (event: MouseEvent, iframe?: HTMLIFrameElement) => void;
    pointerDown: (event: PointerEvent, iframe?: HTMLIFrameElement) => void;
    pointerMove: (event: PointerEvent, iframe?: HTMLIFrameElement) => void;
    pointerUp: (event: PointerEvent, iframe?: HTMLIFrameElement) => void;
    cancelDrawing: (reason?: DrawingCancelReason) => boolean;
    consumeSuppressedClick: (event?: MouseEvent) => boolean;
  };
  tracking: {
    cancelPendingFrame: () => void;
    clear: () => void;
    hasTarget: () => boolean;
  };
}

export function createHighlighterHoverController(
  getCallbacks: () => HighlighterCallbacks,
  getState: HighlighterStateGetters
): HoverController {
  const session = createHoverSession();
  const overlayActions = createHoverOverlayActions(session);
  const clearHoverPreview = () => {
    overlayActions.hideHoverOverlay();
    session.lastHoverTarget = null;
  };
  const drawing = createFreeFrameDrawingHandlers({
    getCallbacks,
    getState,
    hideHoverOverlay: clearHoverPreview,
    session,
  });
  const interactions = createHoverInteractionHandlers({
    getCallbacks,
    getState,
    hoverThrottleMs: 100,
    overlayActions: {
      ...overlayActions,
      hideHoverOverlay: clearHoverPreview,
    },
    session,
    consumeSuppressedClick: drawing.consumeSuppressedClick,
  });
  const cancelPendingHoverPreview = () => {
    interactions.cancelPendingHoverFrame();
    clearHoverPreview();
  };

  return {
    overlay: {
      createContainer: overlayActions.createOverlayContainer,
      removeContainer: () => {
        interactions.cancelPendingHoverFrame();
        overlayActions.removeOverlayContainer();
        session.lastHoverTarget = null;
      },
      createPreview: overlayActions.createHoverOverlay,
      removePreview: () => {
        interactions.cancelPendingHoverFrame();
        overlayActions.removeHoverOverlay();
        session.lastHoverTarget = null;
      },
      hidePreview: cancelPendingHoverPreview,
    },
    invalidation: {
      frameCache: () => invalidateHoverFrameCache(session),
    },
    input: {
      dragStart: drawing.handleDragStart,
      mouseDown: drawing.handleMouseDown,
      mouseMove: interactions.handleMouseMove,
      mouseLeave: interactions.handleMouseLeave,
      click: interactions.handleClick,
      pointerDown: drawing.handlePointerDown,
      pointerMove: drawing.handlePointerMove,
      pointerUp: drawing.handlePointerUp,
      cancelDrawing: drawing.cancelDrawing,
      consumeSuppressedClick: drawing.consumeSuppressedClick,
    },
    tracking: {
      cancelPendingFrame: interactions.cancelPendingHoverFrame,
      clear: interactions.clearHoverTracking,
      hasTarget: () => session.lastHoverTarget !== null,
    },
  };
}

export function logAccessibleIframeCount(): void {
  const iframes = getAccessibleIframes();
  logger.log('Highlighter mode enabled', { accessibleIframes: iframes.length });
}
