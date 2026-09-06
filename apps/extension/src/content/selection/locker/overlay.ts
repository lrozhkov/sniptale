import { appendToContentOverlayRoot, getContentUiElementById } from '../../platform/dom-host';
import { isPageElementPickerActive, isSelectionDelegatedMode } from './routing';
import { NAVIGATION_LOCK_OVERLAY_ID } from './constants';
import { resolveShieldedPageElement } from '../page-element-target';

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

function getComposedParentElement(element: Element): HTMLElement | null {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  if (root.nodeType === Node.DOCUMENT_FRAGMENT_NODE && 'host' in root) {
    const host: unknown = root.host;
    if (
      typeof host === 'object' &&
      host !== null &&
      Reflect.get(host, 'nodeType') === Node.ELEMENT_NODE &&
      Reflect.get(host, 'namespaceURI') === 'http://www.w3.org/1999/xhtml'
    ) {
      return host as HTMLElement;
    }
  }
  const frame = element.ownerDocument.defaultView?.frameElement;
  return frame?.namespaceURI === 'http://www.w3.org/1999/xhtml' ? (frame as HTMLElement) : null;
}

function canScrollInDirection(element: HTMLElement, deltaX: number, deltaY: number): boolean {
  const view = element.ownerDocument.defaultView;
  if (!view) return false;
  const style = view.getComputedStyle(element);
  const allowed = new Set(['auto', 'scroll', 'overlay']);
  const canScrollX =
    allowed.has(style.overflowX) &&
    element.scrollWidth > element.clientWidth &&
    ((deltaX < 0 && element.scrollLeft > 0) ||
      (deltaX > 0 && element.scrollLeft + element.clientWidth < element.scrollWidth));
  const canScrollY =
    allowed.has(style.overflowY) &&
    element.scrollHeight > element.clientHeight &&
    ((deltaY < 0 && element.scrollTop > 0) ||
      (deltaY > 0 && element.scrollTop + element.clientHeight < element.scrollHeight));
  return canScrollX || canScrollY;
}

function resolveWheelScrollElement(
  target: Element,
  deltaX: number,
  deltaY: number
): HTMLElement | null {
  let current: HTMLElement | null =
    target.namespaceURI === 'http://www.w3.org/1999/xhtml'
      ? (target as HTMLElement)
      : target.parentElement;
  while (current) {
    if (canScrollInDirection(current, deltaX, deltaY)) return current;
    current = getComposedParentElement(current);
  }
  return null;
}

function canWindowScrollInDirection(win: Window, deltaX: number, deltaY: number): boolean {
  const root = win.document.scrollingElement ?? win.document.documentElement;
  const maxScrollX = Math.max(0, root.scrollWidth - win.innerWidth);
  const maxScrollY = Math.max(0, root.scrollHeight - win.innerHeight);
  return (
    (deltaX < 0 && win.scrollX > 0) ||
    (deltaX > 0 && win.scrollX < maxScrollX) ||
    (deltaY < 0 && win.scrollY > 0) ||
    (deltaY > 0 && win.scrollY < maxScrollY)
  );
}

function getAccessibleParentWindow(win: Window): Window | null {
  try {
    const parent = win.parent;
    if (parent === win) return null;
    void parent.document.documentElement;
    return parent;
  } catch {
    return null;
  }
}

function resolveWheelScrollWindow(target: Element | null, deltaX: number, deltaY: number): Window {
  let current: Window | null = target?.ownerDocument.defaultView ?? window;
  let highestAccessible = current;
  while (current) {
    highestAccessible = current;
    if (canWindowScrollInDirection(current, deltaX, deltaY)) return current;
    current = getAccessibleParentWindow(current);
  }
  return highestAccessible;
}

export function handleOverlayWheel(event: WheelEvent): void {
  event.preventDefault();
  const target = resolveShieldedPageElement(event);
  const scrollElement = target
    ? resolveWheelScrollElement(target, event.deltaX, event.deltaY)
    : null;
  if (scrollElement) {
    scrollElement.scrollBy({
      left: event.deltaX,
      top: event.deltaY,
      behavior: 'auto',
    });
    return;
  }
  resolveWheelScrollWindow(target, event.deltaX, event.deltaY).scrollBy({
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

  overlay.style.cursor =
    isSelectionDelegatedMode() || isPageElementPickerActive() ? 'inherit' : NAVIGATION_LOCK_CURSOR;
  overlay.style.display = enabled ? 'block' : 'none';
}

/**
 * Removes the overlay node when the lock subsystem is torn down.
 */
export function removeNavigationLockOverlay(): void {
  getNavigationLockOverlay()?.remove();
}
