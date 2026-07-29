import { runBestEffort } from '@sniptale/foundation/best-effort';
import { appendToContentOverlayRoot } from '../../platform/dom-host';
import { applyIsolatedContentRootStyle } from '../../platform/dom-host/isolated';
import { createLogger } from '@sniptale/platform/observability/logger';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { sendRegionSelectorRuntimeMessage } from './messaging';
import { createRegionSelectorDocumentHandlers, detachRegionSelectorListeners } from './events';
import {
  createRegionSelectorSurfaceActions,
  hideRecordingOverlay,
  updateRegionSelectorUi,
} from './surface';
import {
  createDefaultRegionSelectorState,
  type RegionSelectorBounds,
  type RegionSelectorController,
  type RegionSelectorControllerDeps,
} from './types';
import type { ViewportInfo } from '@sniptale/runtime-contracts/video/types/types';

const logger = createLogger({ namespace: 'ContentRegionSelectorUi' });

function createResolvedRegionSelectorDeps(
  deps: RegionSelectorControllerDeps
): Required<RegionSelectorControllerDeps> {
  return {
    appendToContentOverlayRoot,
    applyIsolatedContentRootStyle,
    sendRuntimeMessage: sendRegionSelectorRuntimeMessage,
    getViewportInfo: readDefaultViewportInfo,
    ...deps,
  } satisfies Required<RegionSelectorControllerDeps>;
}

function readDefaultViewportInfo(): ViewportInfo {
  const visualViewport = window.visualViewport;
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    devicePixelRatio: window.devicePixelRatio || 1,
    viewportOffsetX: visualViewport?.offsetLeft ?? 0,
    viewportOffsetY: visualViewport?.offsetTop ?? 0,
    visualViewportScale: visualViewport?.scale ?? 1,
  };
}

function hideRegionSelector(args: {
  detachListeners: () => void;
  state: ReturnType<typeof createDefaultRegionSelectorState>;
}): void {
  args.detachListeners();
  args.state.isDragging = false;
  args.state.isResizing = false;
  args.state.resizeCorner = '';
  args.state.regionSelectorContainer?.remove();
  args.state.regionSelectorContainer = null;
  args.state.regionSelectorTooltip = null;
  args.state.activeRequestBinding = null;
}

function createRegionSelectorMessagingActions(args: {
  hideRegionSelector: () => void;
  resolvedDeps: Required<RegionSelectorControllerDeps>;
  state: ReturnType<typeof createDefaultRegionSelectorState>;
}) {
  return {
    handleRegionSelected(region: RegionSelectorBounds) {
      const binding = args.state.activeRequestBinding;
      const captureRegion = { ...region };
      args.state.selectedRegion = captureRegion;
      args.hideRegionSelector();
      if (!binding) {
        return;
      }

      runBestEffort(
        args.resolvedDeps.sendRuntimeMessage({
          type: VideoMessageType.REGION_SELECTED,
          ...binding,
          region: captureRegion,
          captureViewport: args.resolvedDeps.getViewportInfo(),
        }),
        logger,
        'Failed to notify selected region',
        { type: VideoMessageType.REGION_SELECTED }
      );
    },

    handleRegionCancelled() {
      const binding = args.state.activeRequestBinding;
      args.state.selectedRegion = null;
      args.hideRegionSelector();
      if (!binding) {
        return;
      }

      runBestEffort(
        args.resolvedDeps.sendRuntimeMessage({
          type: VideoMessageType.REGION_SELECTION_CANCELLED,
          ...binding,
        }),
        logger,
        'Failed to notify cancelled region selection',
        { type: VideoMessageType.REGION_SELECTION_CANCELLED }
      );
    },
  };
}

/**
 * Creates the content-owned region overlay controller. The instance owns all mutable state,
 * document listeners, and overlay DOM lifecycles for region-selection flows.
 */
export function createRegionSelectorController(
  deps: RegionSelectorControllerDeps = {}
): RegionSelectorController {
  const resolvedDeps = createResolvedRegionSelectorDeps(deps);
  const state = createDefaultRegionSelectorState();
  let handleRegionCancelled = () => {};
  const documentHandlers = createRegionSelectorDocumentHandlers({
    handleRegionCancelled: () => handleRegionCancelled(),
    state,
    updateUi: () => updateRegionSelectorUi(state),
  });
  const detachListeners = () =>
    detachRegionSelectorListeners({
      handleKeyDown: documentHandlers.handleKeyDown,
      handleMouseMove: documentHandlers.handleMouseMove,
      handleMouseUp: documentHandlers.handleMouseUp,
      handlePointerMove: documentHandlers.handlePointerMove,
      handlePointerUp: documentHandlers.handlePointerUp,
      state,
    });
  const hideSelector = () => hideRegionSelector({ detachListeners, state });
  const messagingActions = createRegionSelectorMessagingActions({
    hideRegionSelector: hideSelector,
    resolvedDeps,
    state,
  });
  handleRegionCancelled = () => messagingActions.handleRegionCancelled();
  const surfaceActions = createRegionSelectorSurfaceActions({
    bindDocumentEvents: documentHandlers.bindDocumentEvents,
    handleRegionCancelled,
    handleRegionSelected: (region) => messagingActions.handleRegionSelected(region),
    resolvedDeps,
    state,
  });

  return createRegionSelectorPublicController({
    hideSelector,
    state,
    surfaceActions,
  });
}

function createRegionSelectorPublicController(args: {
  hideSelector: () => void;
  state: ReturnType<typeof createDefaultRegionSelectorState>;
  surfaceActions: ReturnType<typeof createRegionSelectorSurfaceActions>;
}): RegionSelectorController {
  return {
    clearSelectedRegion() {
      args.state.selectedRegion = null;
    },

    dispose() {
      args.hideSelector();
      hideRecordingOverlay(args.state);
      args.state.selectedRegion = null;
    },

    getSelectedRegion() {
      return args.state.selectedRegion;
    },

    hideRecordingOverlay: () => hideRecordingOverlay(args.state),
    hideRegionSelector: args.hideSelector,
    showRecordingOverlay: (region) => args.surfaceActions.showRecordingOverlay(region),
    showRegionSelector: (binding) => {
      args.state.activeRequestBinding = binding;
      args.surfaceActions.showRegionSelector();
    },
  };
}
