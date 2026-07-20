import type { BrowserStorageAdapter } from '@sniptale/platform/browser/storage-types';
import { createStorageAreaAdapter } from './area-adapter';

export const privacyErasureBrowserStorage: BrowserStorageAdapter = {
  local: createStorageAreaAdapter('local', false),
  sync: createStorageAreaAdapter('sync', false),
  session: createStorageAreaAdapter('session', false),
  canObserveChanges: () => false,
  subscribeToChanges: () => () => undefined,
};
