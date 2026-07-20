import { normalizeChromeRuntimeError, subscribeToChromeEvent } from './callback';

type ContentRuntimeShimStorageChanges = Record<string, chrome.storage.StorageChange>;
export type ContentRuntimeShimStorageChangeListener = (
  changes: ContentRuntimeShimStorageChanges,
  areaName: chrome.storage.AreaName
) => void;

export type ContentRuntimeShimBrowserAdapter = {
  canObserveStorageChanges(): boolean;
  getLocalStorage(keys: string[]): Promise<Record<string, unknown>>;
  subscribeToStorageChanges(listener: ContentRuntimeShimStorageChangeListener): () => void;
};

function getRuntimeLastError(): Error | null {
  const lastError = chrome.runtime?.lastError;
  return lastError ? normalizeChromeRuntimeError(lastError) : null;
}

function isLocalStorageAvailable(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

export const contentRuntimeShimBrowser: ContentRuntimeShimBrowserAdapter = {
  canObserveStorageChanges() {
    return typeof chrome !== 'undefined' && Boolean(chrome.storage?.onChanged);
  },

  getLocalStorage(keys) {
    if (!isLocalStorageAvailable()) {
      return Promise.reject(new Error('chrome.storage.local is unavailable'));
    }

    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (items) => {
        const error = getRuntimeLastError();
        if (error) {
          reject(error);
          return;
        }

        resolve(items);
      });
    });
  },

  subscribeToStorageChanges(listener) {
    return subscribeToChromeEvent(chrome.storage?.onChanged, listener);
  },
};
