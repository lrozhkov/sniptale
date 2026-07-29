import { subscribeToChromeEvent } from './callback';

type BeforeNavigateListener = typeof chrome.webNavigation.onBeforeNavigate.addListener extends (
  listener: infer T
) => void
  ? T
  : never;
type CommittedListener = typeof chrome.webNavigation.onCommitted.addListener extends (
  listener: infer T
) => void
  ? T
  : never;
type CompletedListener = typeof chrome.webNavigation.onCompleted.addListener extends (
  listener: infer T
) => void
  ? T
  : never;
type ErrorOccurredListener = typeof chrome.webNavigation.onErrorOccurred.addListener extends (
  listener: infer T
) => void
  ? T
  : never;

/**
 * Shared browser webNavigation seam for navigation listener ownership.
 */
interface BrowserWebNavigationAdapter {
  subscribeToBeforeNavigate(listener: BeforeNavigateListener): () => void;
  subscribeToCommitted(listener: CommittedListener): () => void;
  subscribeToCompleted(listener: CompletedListener): () => void;
  subscribeToErrorOccurred(listener: ErrorOccurredListener): () => void;
}

export const browserWebNavigation: BrowserWebNavigationAdapter = {
  subscribeToBeforeNavigate(listener) {
    return subscribeToChromeEvent(chrome.webNavigation?.onBeforeNavigate, listener);
  },
  subscribeToCommitted(listener) {
    return subscribeToChromeEvent(chrome.webNavigation?.onCommitted, listener);
  },
  subscribeToCompleted(listener) {
    return subscribeToChromeEvent(chrome.webNavigation?.onCompleted, listener);
  },
  subscribeToErrorOccurred(listener) {
    return subscribeToChromeEvent(chrome.webNavigation?.onErrorOccurred, listener);
  },
};
