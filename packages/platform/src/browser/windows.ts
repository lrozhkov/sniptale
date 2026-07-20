/**
 * Shared browser windows seam for extension-owned window flows.
 */
interface BrowserWindowsAdapter {
  create(createData: chrome.windows.CreateData): Promise<chrome.windows.Window | undefined>;
  get(windowId: number, queryOptions?: chrome.windows.QueryOptions): Promise<chrome.windows.Window>;
  update(
    windowId: number,
    updateInfo: chrome.windows.UpdateInfo
  ): Promise<chrome.windows.Window | undefined>;
}

export const browserWindows: BrowserWindowsAdapter = {
  create(createData) {
    if (typeof chrome === 'undefined' || !chrome.windows?.create) {
      return Promise.reject(new Error('chrome.windows.create is unavailable'));
    }

    return chrome.windows.create(createData);
  },

  get(windowId, queryOptions) {
    if (typeof chrome === 'undefined' || !chrome.windows?.get) {
      return Promise.reject(new Error('chrome.windows.get is unavailable'));
    }

    return queryOptions ? chrome.windows.get(windowId, queryOptions) : chrome.windows.get(windowId);
  },

  update(windowId, updateInfo) {
    if (typeof chrome === 'undefined' || !chrome.windows?.update) {
      return Promise.reject(new Error('chrome.windows.update is unavailable'));
    }

    return chrome.windows.update(windowId, updateInfo);
  },
};
