import { getAccessibleIframes, getAbsolutePosition } from '../../platform/frame';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  applyHighlighterSettingsChange,
  createHighlighterHoverState,
  ensureHighlighterOverlayContainer,
  ensureHighlighterSettingsLoaded,
  ensureHoverOverlay,
  getCurrentBorderPreset,
  hideHoverOverlay as hideHoverOverlayState,
  removeHighlighterOverlayContainer,
  removeHoverOverlay as removeHoverOverlayState,
  showHoverOverlay as showHoverOverlayState,
} from './helpers';
import { createHoverInteractionHandlers } from './interactions';
import type { HighlighterSettingsChangedDetail } from '../../platform/page-context/frame-events';

const logger = createLogger({ namespace: 'ContentHighlighter:HoverPreview' });

type HoverAbsolutePosition = ReturnType<typeof getAbsolutePosition>;
type HoverBorderPreset = ReturnType<typeof getCurrentBorderPreset>;

interface HighlighterCallbacks {
  addFrame: ((element: HTMLElement) => void) | null;
  hasFrameForElement: ((element: HTMLElement) => boolean) | null;
}

interface HighlighterStateGetters {
  isModeEnabled: () => boolean;
  isPaused: () => boolean;
  isFrameEditing: () => boolean;
  isTooltipVisible: () => boolean;
}

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

function logHoverOverlayShown(pos: HoverAbsolutePosition, preset: HoverBorderPreset): void {
  logger.debug('Showing hover overlay', {
    elementPos: { x: pos.x, y: pos.y, width: pos.width, height: pos.height },
    presetPadding: preset.padding,
    presetBorderWidth: preset.width,
    calculatedCoords: pos,
  });
}

function createHoverOverlayActions(props: {
  getCurrentBorderPreset: () => HoverBorderPreset;
  hideHoverOverlayState: () => void;
  hoverState: ReturnType<typeof createHighlighterHoverState>;
  showHoverOverlayState: (pos: HoverAbsolutePosition, preset: HoverBorderPreset) => void;
}) {
  function createOverlayContainer(): void {
    ensureHighlighterOverlayContainer(props.hoverState);
  }

  function removeOverlayContainer(): void {
    removeHighlighterOverlayContainer(props.hoverState);
  }

  function createHoverOverlay(): void {
    void ensureHighlighterSettingsLoaded(props.hoverState);
    ensureHoverOverlay(props.hoverState, props.getCurrentBorderPreset());
  }

  function removeHoverOverlay(): void {
    removeHoverOverlayState(props.hoverState);
  }

  function showHoverOverlay(element: HTMLElement): void {
    createOverlayContainer();
    createHoverOverlay();
    if (!props.hoverState.hoverOverlay || !props.hoverState.overlayContainer) {
      logger.warn('Cannot show hover overlay without overlay container state');
      return;
    }

    const pos = getAbsolutePosition(element);
    const preset = props.getCurrentBorderPreset();

    logHoverOverlayShown(pos, preset);
    props.showHoverOverlayState(pos, preset);
  }

  return {
    createHoverOverlay,
    createOverlayContainer,
    hideHoverOverlay: props.hideHoverOverlayState,
    removeHoverOverlay,
    removeOverlayContainer,
    showHoverOverlay,
  };
}

function createHoverTrackingState() {
  return {
    hoverRafId: null as number | null,
    isHoverPreviewFrozen: false,
    lastHoverProcessTime: 0,
    lastHoverTarget: null as HTMLElement | null,
    lastHoverX: -1,
    lastHoverY: -1,
  };
}

function createHoverControllerMaintenance(
  hoverState: ReturnType<typeof createHighlighterHoverState>,
  trackingState: ReturnType<typeof createHoverTrackingState>
) {
  function cancelPendingHoverFrame(): void {
    if (trackingState.hoverRafId !== null) {
      cancelAnimationFrame(trackingState.hoverRafId);
      trackingState.hoverRafId = null;
    }
  }

  function clearHoverTracking(): void {
    trackingState.lastHoverTarget = null;
    trackingState.lastHoverX = -1;
    trackingState.lastHoverY = -1;
  }

  function invalidateFrameCache(): void {
    hoverState.frameCacheDirty = true;
  }

  function invalidateSettingsCache(detail?: HighlighterSettingsChangedDetail): void {
    if (detail && applyHighlighterSettingsChange(hoverState, detail)) {
      logger.debug('Synced highlighter settings cache from event detail', {
        defaultBorderPresetId: detail.defaultBorderPresetId,
      });
      return;
    }

    hoverState.cachedHighlighterSettings = null;
    hoverState.settingsLoadPromise = null;
    void ensureHighlighterSettingsLoaded(hoverState);
    logger.debug('Invalidated highlighter settings cache', {
      hasDefaultBorderPresetId: Boolean(detail?.defaultBorderPresetId),
    });
  }

  return {
    cancelPendingHoverFrame,
    clearHoverTracking,
    invalidateFrameCache,
    invalidateSettingsCache,
  };
}

export function createHighlighterHoverController(
  getCallbacks: () => HighlighterCallbacks,
  getState: HighlighterStateGetters
): HoverController {
  const hoverState = createHighlighterHoverState();
  const trackingState = createHoverTrackingState();
  const HOVER_THROTTLE_MS = 100;
  const overlayActions = createHoverOverlayActions({
    getCurrentBorderPreset: () => getCurrentBorderPreset(hoverState),
    hideHoverOverlayState: () => hideHoverOverlayState(hoverState),
    hoverState,
    showHoverOverlayState: (pos, preset) => showHoverOverlayState(hoverState, pos, preset),
  });
  const interactionHandlers = createHoverInteractionHandlers({
    getCallbacks,
    getState,
    hoverState,
    hoverThrottleMs: HOVER_THROTTLE_MS,
    overlayActions,
    trackingState,
  });
  const maintenance = createHoverControllerMaintenance(hoverState, trackingState);

  return {
    createOverlayContainer: overlayActions.createOverlayContainer,
    removeOverlayContainer: overlayActions.removeOverlayContainer,
    createHoverOverlay: overlayActions.createHoverOverlay,
    removeHoverOverlay: overlayActions.removeHoverOverlay,
    hideHoverOverlay: overlayActions.hideHoverOverlay,
    invalidateFrameCache: maintenance.invalidateFrameCache,
    invalidateSettingsCache: maintenance.invalidateSettingsCache,
    handleMouseMove: interactionHandlers.handleMouseMove,
    handleMouseLeave: interactionHandlers.handleMouseLeave,
    handleClick: interactionHandlers.handleClick,
    cancelPendingHoverFrame: maintenance.cancelPendingHoverFrame,
    clearHoverTracking: maintenance.clearHoverTracking,
  };
}

export function logAccessibleIframeCount(): void {
  const iframes = getAccessibleIframes();
  logger.log('Highlighter mode enabled', { accessibleIframes: iframes.length });
}
