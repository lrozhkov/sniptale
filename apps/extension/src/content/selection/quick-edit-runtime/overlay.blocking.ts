import { appendToContentOverlayRoot } from '../../platform/dom-host';
import { applyQuickEditFrameRect, EDITABLE_BORDER } from './overlay.frame';
import type { QuickEditOverlayState } from './overlay.state';

export function ensureQuickEditBlockingOverlay(state: QuickEditOverlayState): void {
  if (state.blockingOverlay) {
    return;
  }

  const blockingOverlay = document.createElement('div');
  blockingOverlay.className = 'sniptale-quick-edit-blocking-overlay';
  blockingOverlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: transparent;
    z-index: 2147483644;
    cursor: pointer;
    display: none;
    pointer-events: none;
  `;

  const activeFrameOverlay = document.createElement('div');
  activeFrameOverlay.className = 'sniptale-quick-edit-active-frame';
  activeFrameOverlay.style.cssText = `
    position: fixed;
    border: ${EDITABLE_BORDER};
    box-sizing: content-box;
    margin: 0;
    padding: 0;
    border-radius: 0;
    pointer-events: none;
    display: none;
    box-shadow:
      0 0 8px color-mix(in srgb, var(--sniptale-color-info) 24%, transparent),
      0 0 16px color-mix(in srgb, var(--sniptale-color-info) 12%, transparent);
  `;

  blockingOverlay.appendChild(activeFrameOverlay);
  appendToContentOverlayRoot(blockingOverlay);
  state.blockingOverlay = blockingOverlay;
  state.activeFrameOverlay = activeFrameOverlay;
}

export function removeQuickEditBlockingOverlay(state: QuickEditOverlayState): void {
  state.blockingOverlay?.remove();
  state.blockingOverlay = null;
  state.activeFrameOverlay = null;
}

export function showQuickEditBlockingOverlay(state: QuickEditOverlayState): void {
  if (state.blockingOverlay) {
    state.blockingOverlay.style.display = 'block';
  }
}

export function updateQuickEditBlockingOverlayShape(
  state: QuickEditOverlayState,
  element: HTMLElement
): void {
  if (!state.activeFrameOverlay) {
    return;
  }

  applyQuickEditFrameRect(state.activeFrameOverlay, element);
  state.activeFrameOverlay.style.display = 'block';
}

export function hideQuickEditBlockingOverlay(state: QuickEditOverlayState): void {
  if (state.blockingOverlay) {
    state.blockingOverlay.style.display = 'none';
  }

  if (state.activeFrameOverlay) {
    state.activeFrameOverlay.style.display = 'none';
  }
}
