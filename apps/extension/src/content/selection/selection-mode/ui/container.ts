import { appendToContentOverlayRoot } from '../../../platform/dom-host';
import { applyIsolatedContentRootStyle } from '../../../platform/dom-host/isolated';
import { applyContentRuntimeTheme } from '../../../platform/page-context/dom';
import { ensureSelectionModeCancelButton } from './cancel-button';
import { SELECTION_MODE_OVERLAY_STYLE } from './styles.constants';
import type { SelectionModeDom } from './dom-types';

interface OverlayContainerOptions {
  cancelSelection: () => void;
  zIndexBase: number;
}

export function createSelectionModeDom(): SelectionModeDom {
  return {
    overlayContainer: null,
    hoverFrame: null,
    scissorsIcon: null,
    hoverSizeLabel: null,
    dragFrame: null,
    finalFrame: null,
    finalOverlay: null,
    sizePanel: null,
    sizeTooltip: null,
    widthInput: null,
    heightInput: null,
    aspectRatioButton: null,
    cancelButton: null,
    dragEventCatcher: null,
  };
}

export function createOverlayContainer(
  dom: SelectionModeDom,
  options: OverlayContainerOptions
): void {
  if (dom.overlayContainer) {
    ensureSelectionModeCancelButton(dom, options);
    return;
  }

  const overlayContainer = document.createElement('div');
  overlayContainer.className = 'sniptale-selection-container';
  applyIsolatedContentRootStyle(
    overlayContainer,
    `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: ${options.zIndexBase};
    `
  );
  applyContentRuntimeTheme(overlayContainer);

  const style = document.createElement('style');
  style.textContent = SELECTION_MODE_OVERLAY_STYLE;

  overlayContainer.appendChild(style);
  appendToContentOverlayRoot(overlayContainer);
  dom.overlayContainer = overlayContainer;
  ensureSelectionModeCancelButton(dom, options);
}
