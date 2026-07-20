import { subscribeToChromeEvent } from './callback';

type BeforeNavigateListener = typeof chrome.webNavigation.onBeforeNavigate.addListener extends (
  listener: infer T
) => void
  ? T
  : never;

/**
 * Shared browser webNavigation seam for navigation listener ownership.
 */
interface BrowserWebNavigationAdapter {
  subscribeToBeforeNavigate(listener: BeforeNavigateListener): () => void;
}

export const browserWebNavigation: BrowserWebNavigationAdapter = {
  subscribeToBeforeNavigate(listener) {
    return subscribeToChromeEvent(chrome.webNavigation?.onBeforeNavigate, listener);
  },
};
