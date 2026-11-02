import { subscribeToChromeEvent } from '@sniptale/platform/browser/callback';
import type { BrowserStorageAdapter } from '@sniptale/platform/browser/storage-types';
import { createStorageAreaAdapter } from './area-adapter';
import type { PersistenceMutationPermit } from '../mutation-barrier';

export const browserStorage = {
  local: createStorageAreaAdapter('local', true),
  sync: createStorageAreaAdapter('sync', true),
  session: createStorageAreaAdapter('session', true),

  canObserveChanges() {
    return typeof chrome !== 'undefined' && Boolean(chrome.storage?.onChanged);
  },

  subscribeToChanges(listener) {
    return subscribeToChromeEvent(chrome.storage?.onChanged, listener);
  },
} satisfies BrowserStorageAdapter;

/** Restore and verify only the selected keys through the caller's admitted storage adapter. */
export async function restoreSelectedStorageKeys(
  adapter: ReturnType<typeof createStorageAreaAdapter>,
  keys: readonly string[],
  before: Record<string, unknown>,
  permit?: PersistenceMutationPermit
): Promise<boolean> {
  const present = Object.fromEntries(
    keys.filter((key) => key in before).map((key) => [key, before[key]])
  );
  const missing = keys.filter((key) => !(key in before));
  if (Object.keys(present).length > 0) await adapter.set(present, permit);
  if (missing.length > 0) await adapter.remove(missing, permit);
  const verified = await adapter.get([...keys]);
  return JSON.stringify(verified) === JSON.stringify(present);
}
