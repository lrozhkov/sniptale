import { subscribeToChromeEvent } from './callback';

/**
 * Shared browser tabs seam for non-messaging tab flows.
 */
interface BrowserTabsAdapter {
  get(tabId: number): Promise<chrome.tabs.Tab>;
  query(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]>;
  create(createProperties: chrome.tabs.CreateProperties): Promise<chrome.tabs.Tab>;
  update(
    tabId: number,
    updateProperties: chrome.tabs.UpdateProperties
  ): Promise<chrome.tabs.Tab | undefined>;
  remove(tabIds: number | number[]): Promise<void>;
  reload(tabId: number, reloadProperties?: chrome.tabs.ReloadProperties): Promise<void>;
  captureVisibleTab(
    windowId?: number,
    options?: chrome.extensionTypes.ImageDetails
  ): Promise<string>;
  setZoom(tabId: number, zoomFactor: number): Promise<void>;
  subscribeToUpdated(
    listener: typeof chrome.tabs.onUpdated.addListener extends (listener: infer T) => void
      ? T
      : never
  ): () => void;
  subscribeToActivated(
    listener: typeof chrome.tabs.onActivated.addListener extends (listener: infer T) => void
      ? T
      : never
  ): () => void;
  subscribeToRemoved(
    listener: typeof chrome.tabs.onRemoved.addListener extends (listener: infer T) => void
      ? T
      : never
  ): () => void;
}

function removeTab(tabId: number): Promise<void> {
  return chrome.tabs.remove(tabId);
}

function removeTabs(tabIds: number[]): Promise<void> {
  return chrome.tabs.remove(tabIds);
}

export const browserTabs: BrowserTabsAdapter = {
  get(tabId) {
    return chrome.tabs.get(tabId);
  },

  query(queryInfo) {
    return chrome.tabs.query(queryInfo);
  },

  create(createProperties) {
    return chrome.tabs.create(createProperties);
  },

  update(tabId, updateProperties) {
    return chrome.tabs.update(tabId, updateProperties);
  },

  remove(tabIds) {
    return Array.isArray(tabIds) ? removeTabs(tabIds) : removeTab(tabIds);
  },

  reload(tabId, reloadProperties) {
    return reloadProperties
      ? chrome.tabs.reload(tabId, reloadProperties)
      : chrome.tabs.reload(tabId);
  },

  captureVisibleTab(windowId, options) {
    if (windowId != null && options != null) {
      return chrome.tabs.captureVisibleTab(windowId, options);
    }

    if (windowId != null) {
      return chrome.tabs.captureVisibleTab(windowId);
    }

    if (options != null) {
      return chrome.tabs.captureVisibleTab(options);
    }

    return chrome.tabs.captureVisibleTab();
  },

  setZoom(tabId, zoomFactor) {
    return chrome.tabs.setZoom(tabId, zoomFactor);
  },

  subscribeToUpdated(listener) {
    return subscribeToChromeEvent(chrome.tabs.onUpdated, listener);
  },

  subscribeToActivated(listener) {
    return subscribeToChromeEvent(chrome.tabs.onActivated, listener);
  },

  subscribeToRemoved(listener) {
    return subscribeToChromeEvent(chrome.tabs.onRemoved, listener);
  },
};
