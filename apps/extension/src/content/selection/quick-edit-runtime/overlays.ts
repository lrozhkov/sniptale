import {
  ensureQuickEditBlockingOverlay,
  hideQuickEditBlockingOverlay,
  removeQuickEditBlockingOverlay,
  showQuickEditBlockingOverlay,
  updateQuickEditBlockingOverlayShape,
} from './overlay.blocking';
import {
  ensureQuickEditHoverOverlay,
  hideQuickEditHoverOverlay,
  removeQuickEditHoverOverlay,
  showQuickEditHoverOverlay,
} from './overlay.hover';
import {
  disconnectQuickEditResizeObserver,
  setupQuickEditResizeObserver,
  type QuickEditOverlayState,
} from './overlay.state';

interface QuickEditOverlayActions {
  createHoverOverlay: () => void;
  removeHoverOverlay: () => void;
  showHoverOverlay: (element: HTMLElement) => void;
  hideHoverOverlay: () => void;
  createBlockingOverlay: () => void;
  showBlockingOverlay: () => void;
  updateBlockingOverlayShape: (element: HTMLElement) => void;
  hideBlockingOverlay: () => void;
  removeBlockingOverlay: () => void;
  setupResizeObserver: (element: HTMLElement, onResize: () => void) => void;
  disconnectResizeObserver: () => void;
}

export function createQuickEditOverlayActions(
  overlayState: QuickEditOverlayState
): QuickEditOverlayActions {
  return {
    createHoverOverlay: () => {
      ensureQuickEditHoverOverlay(overlayState);
    },
    removeHoverOverlay: () => {
      removeQuickEditHoverOverlay(overlayState);
    },
    showHoverOverlay: (element) => {
      showQuickEditHoverOverlay(overlayState, element);
    },
    hideHoverOverlay: () => {
      hideQuickEditHoverOverlay(overlayState);
    },
    createBlockingOverlay: () => {
      ensureQuickEditBlockingOverlay(overlayState);
    },
    showBlockingOverlay: () => {
      showQuickEditBlockingOverlay(overlayState);
    },
    updateBlockingOverlayShape: (element) => {
      updateQuickEditBlockingOverlayShape(overlayState, element);
    },
    hideBlockingOverlay: () => {
      hideQuickEditBlockingOverlay(overlayState);
    },
    removeBlockingOverlay: () => {
      removeQuickEditBlockingOverlay(overlayState);
    },
    setupResizeObserver: (element, onResize) => {
      setupQuickEditResizeObserver(overlayState, element, onResize);
    },
    disconnectResizeObserver: () => {
      disconnectQuickEditResizeObserver(overlayState);
    },
  };
}
