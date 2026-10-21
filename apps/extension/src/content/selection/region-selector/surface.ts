import { calculateContentSizeTooltipPosition } from '@sniptale/ui/content-size-tooltip/core';
import type { ContentSizeTooltipDom } from '@sniptale/ui/content-size-tooltip/dom';
import {
  setContentSizeTooltipPosition,
  syncContentSizeTooltipValues,
} from '@sniptale/ui/content-size-tooltip/dom';
import { bindRegionSelectorRootEvents } from './events';
import { MIN_REGION_SELECTOR_SIZE, resizeRegionDimension } from './helpers';
import { buildRegionSelectorMarkup, updateOverlayMask } from './markup';
import { buildRecordingOverlayNode } from './recording-overlay.helpers';
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

function updateRegionSurface(region: HTMLElement, currentRegion: RegionSelectorBounds): void {
  region.style.left = `${currentRegion.x}px`;
  region.style.top = `${currentRegion.y}px`;
  region.style.width = `${currentRegion.width}px`;
  region.style.height = `${currentRegion.height}px`;
}

function syncRegionSelectorTooltip(
  tooltip: ContentSizeTooltipDom,
  currentRegion: RegionSelectorBounds
): void {
  const maintainAspectRatio = tooltip.aspectRatioButton.getAttribute('aria-pressed') === 'true';

  setContentSizeTooltipPosition(
    tooltip.root,
    calculateContentSizeTooltipPosition({
      anchorRect: currentRegion,
      tooltipWidth: tooltip.root.getBoundingClientRect().width || tooltip.root.offsetWidth || 550,
      tooltipHeight: tooltip.root.getBoundingClientRect().height || tooltip.root.offsetHeight || 50,
    })
  );
  syncContentSizeTooltipValues({
    tooltip,
    width: currentRegion.width,
    height: currentRegion.height,
    maintainAspectRatio,
    widthMin: MIN_REGION_SELECTOR_SIZE,
    widthMax: window.innerWidth,
    heightMin: MIN_REGION_SELECTOR_SIZE,
    heightMax: window.innerHeight,
    canToggleAspectRatio: true,
  });
}

export function updateRegionSelectorUi(state: RegionSelectorState): void {
  if (!state.regionSelectorContainer) {
    return;
  }

  const region = state.regionSelectorContainer.querySelector<HTMLElement>('#sniptale-region');
  if (region) {
    updateRegionSurface(region, state.currentRegion);
    region.style.opacity = state.isResizing ? '0' : '1';
    region.style.cursor = 'move';
  }

  const overlay = state.regionSelectorContainer.querySelector<HTMLElement>('#sniptale-overlay');
  if (overlay) {
    updateOverlayMask(overlay, state.currentRegion);
    overlay.style.cursor = state.isDragging
      ? 'move'
      : state.isResizing
        ? `${state.resizeCorner}-resize`
        : 'crosshair';
  }

  if (state.regionSelectorTooltip) {
    state.regionSelectorTooltip.root.style.visibility =
      state.isResizing || state.isDragging ? 'hidden' : 'visible';
    syncRegionSelectorTooltip(state.regionSelectorTooltip, state.currentRegion);
  }
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
    aspectRatioState: args.state.aspectRatioState,
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
      if (args.state.isDragging || args.state.isResizing) return;
      args.state.isDragging = true;
      args.state.dragStart = { x: event.clientX, y: event.clientY };
      args.state.initialRegion = { ...args.state.currentRegion };
      updateRegionSelectorUi(args.state);
      event.preventDefault();
    },
    onResizeStart: (event, corner) => {
      if (args.state.isDragging || args.state.isResizing) return;
      args.state.isResizing = true;
      args.state.resizeCorner = corner;
      args.state.dragStart = { x: event.clientX, y: event.clientY };
      args.state.initialRegion = { ...args.state.currentRegion };
      updateRegionSelectorUi(args.state);
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
      args.state.currentRegion = resizeRegionDimension(
        args.state.currentRegion,
        'width',
        args.state.currentRegion.width
      );

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
