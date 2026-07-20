import { runBestEffort } from '@sniptale/foundation/best-effort';
import { appendToContentOverlayRoot } from '../../platform/dom-host';
import { applyIsolatedContentRootStyle } from '../../platform/dom-host/isolated';
import { createLogger } from '@sniptale/platform/observability/logger';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { toDevicePixelRegion } from './helpers';
import { sendRegionSelectorRuntimeMessage } from './messaging';
import { createRegionSelectorSurfaceActions, hideRecordingOverlay } from './surface';
import {
  createRegionSelectorDocumentHandlers,
  detachRegionSelectorListeners,
} from './document-events';
import {
  createDefaultRegionSelectorState,
  type RegionSelectorBounds,
  type RegionSelectorController,
  type RegionSelectorControllerDeps,
} from './types';

const logger = createLogger({ namespace: 'ContentRegionSelectorUi' });

function createResolvedRegionSelectorDeps(
  deps: RegionSelectorControllerDeps
): Required<RegionSelectorControllerDeps> {
  return {
    appendToContentOverlayRoot,
    applyIsolatedContentRootStyle,
    sendRuntimeMessage: sendRegionSelectorRuntimeMessage,
    ...deps,
  } satisfies Required<RegionSelectorControllerDeps>;
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
      const devicePixelRegion = toDevicePixelRegion(region);
      args.state.selectedRegion = devicePixelRegion;
      args.hideRegionSelector();
      if (!binding) {
        return;
      }

      runBestEffort(
        args.resolvedDeps.sendRuntimeMessage({
          type: VideoMessageType.REGION_SELECTED,
          ...binding,
          region: devicePixelRegion,
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
