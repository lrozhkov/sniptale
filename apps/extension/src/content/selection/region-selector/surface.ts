import { bindRegionSelectorRootEvents } from './events';
import { buildRegionSelectorMarkup } from './markup.helpers';
import { buildRecordingOverlayNode } from './recording-overlay.helpers';
import { updateRegionDisplay } from './runtime';
import { createRegionSelectorTooltip } from './tooltip';
import {
  applyRegionSelectorTheme,
  getRecordingOverlayMetrics,
  getRecordingOverlayRootStyle,
  getRegionSelectorRootStyle,
} from './config';
import type { createDefaultRegionSelectorState } from './types';
import { type RegionSelectorBounds, type RegionSelectorControllerDeps } from './types';

type RegionSelectorState = ReturnType<typeof createDefaultRegionSelectorState>;

function getRegionSelectorElements(root: HTMLElement) {
  return {
    overlay: root.querySelector<HTMLElement>('#sniptale-overlay')!,
    region: root.querySelector<HTMLElement>('#sniptale-region')!,
  };
}

export function updateRegionSelectorUi(state: RegionSelectorState): void {
  updateRegionDisplay(
    state.regionSelectorContainer,
    state.currentRegion,
    state.regionSelectorTooltip
  );
}

function renderRegionSelector(args: {
  bindDocumentEvents: () => void;
  handleRegionCancelled: () => void;
  handleRegionSelected: (region: RegionSelectorBounds) => void;
  root: HTMLElement;
  state: RegionSelectorState;
}): void {
  args.root.replaceChildren(
    buildRegionSelectorMarkup({
      currentRegion: args.state.currentRegion,
    })
  );

  args.state.regionSelectorTooltip = createRegionSelectorTooltip({
    getCurrentRegion: () => args.state.currentRegion,
    mountInto: args.root,
    onCancel: args.handleRegionCancelled,
    onConfirm: () => args.handleRegionSelected(args.state.currentRegion),
    onRegionChange: (nextRegion) => {
      args.state.currentRegion = nextRegion;
      updateRegionSelectorUi(args.state);
    },
  });

  const { overlay, region } = getRegionSelectorElements(args.root);
  bindRegionSelectorRootEvents({
    overlay,
    region,
    handleRegionCancelled: args.handleRegionCancelled,
    onDragStart: (event) => {
      args.state.isDragging = true;
      args.state.dragStart = { x: event.clientX, y: event.clientY };
      args.state.initialRegion = { ...args.state.currentRegion };
      event.preventDefault();
    },
    onResizeStart: (event, corner) => {
      args.state.isResizing = true;
      args.state.resizeCorner = corner;
      args.state.dragStart = { x: event.clientX, y: event.clientY };
      args.state.initialRegion = { ...args.state.currentRegion };
      event.preventDefault();
    },
  });

  updateRegionSelectorUi(args.state);
  args.bindDocumentEvents();
}

export function hideRecordingOverlay(state: RegionSelectorState): void {
  if (!state.recordingOverlayContainer) {
    return;
  }

  state.recordingOverlayContainer.remove();
  state.recordingOverlayContainer = null;
}

export function createRegionSelectorSurfaceActions(args: {
  bindDocumentEvents: () => void;
  handleRegionCancelled: () => void;
  handleRegionSelected: (region: RegionSelectorBounds) => void;
  resolvedDeps: Required<RegionSelectorControllerDeps>;
  state: RegionSelectorState;
}) {
  return {
    showRecordingOverlay(region: RegionSelectorBounds) {
      hideRecordingOverlay(args.state);

      const overlayMetrics = getRecordingOverlayMetrics(region);
      args.state.recordingOverlayContainer = document.createElement('div');
      args.state.recordingOverlayContainer.id = 'sniptale-recording-overlay';
      args.resolvedDeps.applyIsolatedContentRootStyle(
        args.state.recordingOverlayContainer,
        getRecordingOverlayRootStyle()
      );
      args.state.recordingOverlayContainer.replaceChildren(
        buildRecordingOverlayNode(overlayMetrics)
      );
      args.resolvedDeps.appendToContentOverlayRoot(args.state.recordingOverlayContainer);
    },

    showRegionSelector() {
      if (args.state.regionSelectorContainer) {
        return;
      }

      args.state.regionSelectorContainer = document.createElement('div');
      args.state.regionSelectorContainer.id = 'sniptale-region-selector-root';
      args.resolvedDeps.applyIsolatedContentRootStyle(
        args.state.regionSelectorContainer,
        getRegionSelectorRootStyle()
      );
      applyRegionSelectorTheme(args.state.regionSelectorContainer);
      args.resolvedDeps.appendToContentOverlayRoot(args.state.regionSelectorContainer);
      renderRegionSelector({
        bindDocumentEvents: args.bindDocumentEvents,
        handleRegionCancelled: args.handleRegionCancelled,
        handleRegionSelected: args.handleRegionSelected,
        root: args.state.regionSelectorContainer,
        state: args.state,
      });
    },
  };
}
