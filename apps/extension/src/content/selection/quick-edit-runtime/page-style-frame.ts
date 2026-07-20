import { appendToContentOverlayRoot } from '../../platform/dom-host';
import { applyQuickEditFrameRect, EDITABLE_BORDER } from './overlay.frame';

let pageStyleFrame: HTMLElement | null = null;

function ensureQuickEditPageStyleFrame(): HTMLElement {
  if (pageStyleFrame?.isConnected) {
    return pageStyleFrame;
  }

  const frame = document.createElement('div');
  frame.className = 'sniptale-quick-edit-page-style-frame';
  frame.style.cssText = `
    position: fixed;
    border: ${EDITABLE_BORDER};
    box-sizing: content-box;
    margin: 0;
    padding: 0;
    border-radius: 0;
    pointer-events: none;
    display: none;
    z-index: 2147483645;
    box-shadow:
      0 0 8px color-mix(in srgb, var(--sniptale-color-info) 24%, transparent),
      0 0 16px color-mix(in srgb, var(--sniptale-color-info) 12%, transparent);
  `;

  appendToContentOverlayRoot(frame);
  pageStyleFrame = frame;
  return frame;
}

export function showQuickEditPageStyleFrame(element: HTMLElement): void {
  const frame = ensureQuickEditPageStyleFrame();
  applyQuickEditFrameRect(frame, element);
  frame.style.display = 'block';
}

export function hideQuickEditPageStyleFrame(): void {
  if (pageStyleFrame) {
    pageStyleFrame.style.display = 'none';
  }
}
