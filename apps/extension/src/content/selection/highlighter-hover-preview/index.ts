import { getAccessibleIframes } from '../../platform/frame';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  createHoverInteractionHandlers,
  type HighlighterCallbacks,
  type HighlighterStateGetters,
} from './interactions';
import { createHoverOverlayActions } from './overlay';
import {
  createHoverSession,
  invalidateHighlighterSettings,
  invalidateHoverFrameCache,
} from './session';
import type { HighlighterSettingsChangedDetail } from '../../platform/page-context/frame-events';

const logger = createLogger({ namespace: 'ContentHighlighter:HoverPreview' });

interface HoverController {
  createOverlayContainer: () => void;
  removeOverlayContainer: () => void;
  createHoverOverlay: () => void;
  removeHoverOverlay: () => void;
  hideHoverOverlay: () => void;
  invalidateFrameCache: () => void;
  invalidateSettingsCache: (detail?: HighlighterSettingsChangedDetail) => void;
  handleMouseMove: (event: MouseEvent, iframe?: HTMLIFrameElement) => void;
  handleMouseLeave: () => void;
  handleClick: (event: MouseEvent, iframe?: HTMLIFrameElement) => void;
  cancelPendingHoverFrame: () => void;
  clearHoverTracking: () => void;
}

export function createHighlighterHoverController(
  getCallbacks: () => HighlighterCallbacks,
  getState: HighlighterStateGetters
): HoverController {
  const session = createHoverSession();
  const overlayActions = createHoverOverlayActions(session);
  const interactions = createHoverInteractionHandlers({
    getCallbacks,
    getState,
    hoverThrottleMs: 100,
    overlayActions,
    session,
  });

  return {
    createOverlayContainer: overlayActions.createOverlayContainer,
    removeOverlayContainer: overlayActions.removeOverlayContainer,
    createHoverOverlay: overlayActions.createHoverOverlay,
    removeHoverOverlay: overlayActions.removeHoverOverlay,
    hideHoverOverlay: overlayActions.hideHoverOverlay,
    invalidateFrameCache: () => invalidateHoverFrameCache(session),
    invalidateSettingsCache: (detail) => invalidateHighlighterSettings(session, detail),
    handleMouseMove: interactions.handleMouseMove,
    handleMouseLeave: interactions.handleMouseLeave,
    handleClick: interactions.handleClick,
    cancelPendingHoverFrame: interactions.cancelPendingHoverFrame,
    clearHoverTracking: interactions.clearHoverTracking,
  };
}

export function logAccessibleIframeCount(): void {
  const iframes = getAccessibleIframes();
  logger.log('Highlighter mode enabled', { accessibleIframes: iframes.length });
}
