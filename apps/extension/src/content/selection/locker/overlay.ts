import { appendToContentOverlayRoot, getContentUiElementById } from '../../platform/dom-host';

const NAVIGATION_LOCK_OVERLAY_ID = 'sniptale-navigation-lock-overlay';
const NAVIGATION_LOCK_OVERLAY_Z_INDEX = '2147483644';
const NAVIGATION_LOCK_CURSOR = [
  `url("data:image/svg+xml,`,
  `%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E`,
  `%3Cpath fill='%23ef4444' d='M5.5 3.21V20.8c0 .45.54.67.85.35`,
  `l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.48 0 .72-.58.38-.92L6.35 2.85a.5.5 0 0 0-.85.36Z'/%3E`,
  `%3C/svg%3E") 4 4, auto`,
].join('');

function blockOverlayPointerEvent(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function handleOverlayWheel(event: WheelEvent): void {
  event.preventDefault();
  window.scrollBy({
    left: event.deltaX,
    top: event.deltaY,
    behavior: 'auto',
  });
}

function attachOverlayEventListeners(overlay: HTMLDivElement): void {
  overlay.addEventListener('pointerdown', blockOverlayPointerEvent, { capture: true });
  overlay.addEventListener('mousedown', blockOverlayPointerEvent, { capture: true });
  overlay.addEventListener('click', blockOverlayPointerEvent, { capture: true });
  overlay.addEventListener('dblclick', blockOverlayPointerEvent, { capture: true });
  overlay.addEventListener('auxclick', blockOverlayPointerEvent, { capture: true });
  overlay.addEventListener('contextmenu', blockOverlayPointerEvent, { capture: true });
  overlay.addEventListener('touchstart', blockOverlayPointerEvent, {
    capture: true,
    passive: false,
  });
  overlay.addEventListener('touchend', blockOverlayPointerEvent, { capture: true, passive: false });
  overlay.addEventListener('wheel', handleOverlayWheel, { passive: false });
}

function createNavigationLockOverlay(): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.id = NAVIGATION_LOCK_OVERLAY_ID;
  overlay.setAttribute('aria-hidden', 'true');
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: transparent;
    z-index: ${NAVIGATION_LOCK_OVERLAY_Z_INDEX};
    display: none;
    pointer-events: auto;
    touch-action: none;
    cursor: ${NAVIGATION_LOCK_CURSOR};
  `;

  attachOverlayEventListeners(overlay);
  return overlay;
}

function getNavigationLockOverlay(): HTMLDivElement | null {
  const existingOverlay = getContentUiElementById(NAVIGATION_LOCK_OVERLAY_ID);
  return existingOverlay instanceof HTMLDivElement ? existingOverlay : null;
}

function ensureNavigationLockOverlay(): HTMLDivElement | null {
  if (!document.body && !document.documentElement) {
    return null;
  }

  const existingOverlay = getNavigationLockOverlay();
  if (existingOverlay) {
    if (!existingOverlay.isConnected) {
      appendToContentOverlayRoot(existingOverlay);
    }
    return existingOverlay;
  }

  const overlay = createNavigationLockOverlay();
  appendToContentOverlayRoot(overlay);
  return overlay;
}

/**
 * Keeps a transparent page overlay in sync with screenshot-mode navigation locking.
 * The overlay blocks pointer interaction with the host page while still proxying wheel scroll.
 */
export function syncNavigationLockOverlay(enabled: boolean): void {
  const overlay = ensureNavigationLockOverlay();
  if (!overlay) {
    return;
  }

  overlay.style.display = enabled ? 'block' : 'none';
}

/**
 * Removes the overlay node when the lock subsystem is torn down.
 */
export function removeNavigationLockOverlay(): void {
  getNavigationLockOverlay()?.remove();
}
