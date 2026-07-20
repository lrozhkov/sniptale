import { subscribeToChromeEvent } from '@sniptale/platform/browser/callback';
import type { BrowserStorageAdapter } from '@sniptale/platform/browser/storage-types';
import { createStorageAreaAdapter } from './area-adapter';

export const browserStorage: BrowserStorageAdapter = {
  local: createStorageAreaAdapter('local', true),
  sync: createStorageAreaAdapter('sync', true),
  session: createStorageAreaAdapter('session', true),

  canObserveChanges() {
    return typeof chrome !== 'undefined' && Boolean(chrome.storage?.onChanged);
  },

  subscribeToChanges(listener) {
    return subscribeToChromeEvent(chrome.storage?.onChanged, listener);
  },
};
