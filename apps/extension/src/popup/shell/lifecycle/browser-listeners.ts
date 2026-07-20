import { browserTabs } from '@sniptale/platform/browser/tabs';

import type { PopupLifecycleBrowserListenerParamsGetter } from './types';

export function registerPopupLifecycleBrowserListeners(
  getParams: PopupLifecycleBrowserListenerParamsGetter
) {
  const handleWindowFocus = () => {
    const params = getParams();
    void params.refreshActiveTabCapabilities();
    void params.refreshGalleryStatus();
  };

  const handleTabActivated = () => {
    const params = getParams();
    params.clearAppliedViewportAuthority();
    void params.refreshActiveTabCapabilities();
  };

  const handleTabUpdated = (
    _tabId: number,
    changeInfo: { status?: string; url?: string },
    tab: chrome.tabs.Tab
  ) => {
    if (tab.active && (typeof changeInfo.url === 'string' || changeInfo.status === 'complete')) {
      const params = getParams();
      params.clearAppliedViewportAuthority();
      void params.refreshActiveTabCapabilities();
    }
  };

  window.addEventListener('focus', handleWindowFocus);
  const cleanupActivated = browserTabs.subscribeToActivated(handleTabActivated);
  const cleanupUpdated = browserTabs.subscribeToUpdated(handleTabUpdated);

  return () => {
    window.removeEventListener('focus', handleWindowFocus);
    cleanupActivated();
    cleanupUpdated();
  };
}
