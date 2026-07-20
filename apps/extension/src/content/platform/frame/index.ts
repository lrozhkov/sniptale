/**
 * Facade exports for same-origin iframe utilities.
 */

export {
  getAbsolutePosition,
  getAccessibleIframes,
  getContainingIframe,
  getIframeDocument,
  getViewportClientPoint,
  isIframeAccessible,
  walkAllDocuments,
} from './core';
export { mountStyleInAccessibleDocuments } from './documents';
export { addEventListenerToAllWindowsDynamic } from './listeners';
export { waitForAccessibleIframeReady, type AccessibleIframeReadyResult } from './ready';
export { addScrollListenersToAllWindows } from './scroll-listeners';
export { findElementBySelector } from './selectors';
export { clearAllSniptaleIds, findElementBySniptaleId } from './sniptale';
export { resolveIframeEventTarget } from './target';
