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
    mouseMove: (event: MouseEvent, iframe?: HTMLIFrameElement) => void;
    mouseLeave: () => void;
    click: (event: MouseEvent, iframe?: HTMLIFrameElement) => void;
    pointerDown: (event: PointerEvent, iframe?: HTMLIFrameElement) => void;
    pointerMove: (event: PointerEvent, iframe?: HTMLIFrameElement) => void;
    pointerUp: (event: PointerEvent, iframe?: HTMLIFrameElement) => void;
    cancelDrawing: (reason?: DrawingCancelReason) => boolean;
  };
  tracking: {
    cancelPendingFrame: () => void;
    clear: () => void;
  };
}

export function createHighlighterHoverController(
  getCallbacks: () => HighlighterCallbacks,
  getState: HighlighterStateGetters
): HoverController {
  const session = createHoverSession();
  const overlayActions = createHoverOverlayActions(session);
  const drawing = createFreeFrameDrawingHandlers({
    getCallbacks,
    getState,
    hideHoverOverlay: overlayActions.hideHoverOverlay,
    session,
  });
  const interactions = createHoverInteractionHandlers({
    getCallbacks,
    getState,
    hoverThrottleMs: 100,
    overlayActions,
    session,
    consumeSuppressedClick: drawing.consumeSuppressedClick,
  });

  return {
    overlay: {
      createContainer: overlayActions.createOverlayContainer,
      removeContainer: overlayActions.removeOverlayContainer,
      createPreview: overlayActions.createHoverOverlay,
      removePreview: overlayActions.removeHoverOverlay,
      hidePreview: overlayActions.hideHoverOverlay,
    },
    invalidation: {
      frameCache: () => invalidateHoverFrameCache(session),
    },
    input: {
      mouseMove: interactions.handleMouseMove,
      mouseLeave: interactions.handleMouseLeave,
      click: interactions.handleClick,
      pointerDown: drawing.handlePointerDown,
      pointerMove: drawing.handlePointerMove,
      pointerUp: drawing.handlePointerUp,
      cancelDrawing: drawing.cancelDrawing,
    },
    tracking: {
      cancelPendingFrame: interactions.cancelPendingHoverFrame,
      clear: interactions.clearHoverTracking,
    },
  };
}

export function logAccessibleIframeCount(): void {
  const iframes = getAccessibleIframes();
  logger.log('Highlighter mode enabled', { accessibleIframes: iframes.length });
}
