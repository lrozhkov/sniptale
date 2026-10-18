import { browserStorage } from '../browser-storage';
import type { BrowserStorageAreaAdapter } from '@sniptale/platform/browser/storage-types';
import { runWithExclusivePersistenceMutationPermit } from '../mutation-barrier';

function localStorageArea(): BrowserStorageAreaAdapter {
  return browserStorage.local;
}

export function persistBrowserStoredPreference(storageKey: string, value: string): Promise<void> {
  return localStorageArea().set({ [storageKey]: value });
}

export function readBrowserStoredPreference(storageKey: string): Promise<Record<string, unknown>> {
  return localStorageArea().get([storageKey]);
}

export async function initializeBrowserStoredPreference(
  storageKey: string,
  initialValue: string
): Promise<void> {
  await runWithExclusivePersistenceMutationPermit(async (permit) => {
    const values = await browserStorage.local.get([storageKey]);
    if (values[storageKey] === undefined) {
      await browserStorage.local.set({ [storageKey]: initialValue }, permit);
    }
  });
}
