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
export {
  createDocumentPagePlacement,
  getDocumentViewportBounds,
  getTopViewportPoint,
  resolveDocumentPagePlacement,
  updateDocumentPagePlacement,
  type DocumentPagePlacement,
} from './page-placement';
export { waitForAccessibleIframeReady, type AccessibleIframeReadyResult } from './ready';
export { addScrollListenersToAllWindows } from './scroll-listeners';
export { findElementBySelector, findHtmlElementBySelector } from './selectors';
export {
  clearAllSniptaleIds,
  clearRetainedSniptaleIds,
  findElementBySniptaleId,
  getSniptaleIdCleanupGeneration,
  releaseSniptaleId,
  retainSniptaleId,
} from './sniptale';
export {
  resolveIframeEventElement,
  resolveIframeEventTarget,
  resolveIframePointTarget,
} from './target';
