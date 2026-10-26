import { normalizeChromeRuntimeError, subscribeToChromeEvent } from './callback';

type ContentRuntimeShimStorageChanges = Record<string, chrome.storage.StorageChange>;
export type ContentRuntimeShimStorageChangeListener = (
  changes: ContentRuntimeShimStorageChanges,
  areaName: chrome.storage.AreaName
) => void;

export type ContentRuntimeShimBrowserAdapter = {
  canObserveStorageChanges(): boolean;
  getLocalStorage(keys: string[]): Promise<Record<string, unknown>>;
  getSyncStorage(keys: string[]): Promise<Record<string, unknown>>;
  subscribeToStorageChanges(listener: ContentRuntimeShimStorageChangeListener): () => void;
};

function getRuntimeLastError(): Error | null {
  const lastError = chrome.runtime?.lastError;
  return lastError ? normalizeChromeRuntimeError(lastError) : null;
}

function getShimStorage(area: 'local' | 'sync', keys: string[]): Promise<Record<string, unknown>> {
  if (typeof chrome === 'undefined' || !chrome.storage?.[area])
    return Promise.reject(new Error(`chrome.storage.${area} is unavailable`));
  return new Promise((resolve, reject) => {
    chrome.storage[area].get(keys, (items) => {
      const error = getRuntimeLastError();
      if (error) reject(error);
      else resolve(items);
    });
  });
}

export const contentRuntimeShimBrowser: ContentRuntimeShimBrowserAdapter = {
  canObserveStorageChanges() {
    return typeof chrome !== 'undefined' && Boolean(chrome.storage?.onChanged);
  },

  getLocalStorage(keys) {
    return getShimStorage('local', keys);
  },
  getSyncStorage(keys) {
    return getShimStorage('sync', keys);
  },

  subscribeToStorageChanges(listener) {
    return subscribeToChromeEvent(chrome.storage?.onChanged, listener);
  },
};
