import { browserStorage } from '../browser-storage';
import type { BrowserStorageAreaAdapter } from '@sniptale/platform/browser/storage-types';

function localStorageArea(): BrowserStorageAreaAdapter {
  return browserStorage.local;
}

export function persistBrowserStoredPreference(storageKey: string, value: string): Promise<void> {
  return localStorageArea().set({ [storageKey]: value });
}

export function readBrowserStoredPreference(storageKey: string): Promise<Record<string, unknown>> {
  return localStorageArea().get([storageKey]);
}
