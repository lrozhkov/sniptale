import { appendToContentOverlayRoot } from '../../platform/dom-host';
import { applyQuickEditFrameRect, EDITABLE_BORDER } from './overlay.frame';
import type { QuickEditOverlayState } from './overlay.state';

export function ensureQuickEditHoverOverlay(state: QuickEditOverlayState): HTMLElement {
  if (state.hoverOverlay) {
    return state.hoverOverlay;
  }

  const hoverOverlay = document.createElement('div');
  hoverOverlay.className = 'sniptale-quick-edit-hover';
  hoverOverlay.style.cssText = `
    position: fixed;
    border: ${EDITABLE_BORDER};
    box-sizing: content-box;
    margin: 0;
    padding: 0;
    border-radius: 0;
    pointer-events: none;
    opacity: 0.62;
    transition:
      top 0.15s ease-out,
      left 0.15s ease-out,
      width 0.15s ease-out,
      height 0.15s ease-out,
      opacity 0.15s ease-out;
    z-index: 2147483645;
    display: none;
    box-shadow:
      0 0 8px color-mix(in srgb, var(--sniptale-color-info) 24%, transparent),
      0 0 16px color-mix(in srgb, var(--sniptale-color-info) 12%, transparent);
  `;

  appendToContentOverlayRoot(hoverOverlay);
  state.hoverOverlay = hoverOverlay;
  return hoverOverlay;
}

export function removeQuickEditHoverOverlay(state: QuickEditOverlayState): void {
  state.hoverOverlay?.remove();
  state.hoverOverlay = null;
}

export function showQuickEditHoverOverlay(
  state: QuickEditOverlayState,
  element: HTMLElement
): void {
  const hoverOverlay = ensureQuickEditHoverOverlay(state);
  applyQuickEditFrameRect(hoverOverlay, element);
  hoverOverlay.style.display = 'block';
}

export function hideQuickEditHoverOverlay(state: QuickEditOverlayState): void {
  if (state.hoverOverlay) {
    state.hoverOverlay.style.display = 'none';
  }
}
