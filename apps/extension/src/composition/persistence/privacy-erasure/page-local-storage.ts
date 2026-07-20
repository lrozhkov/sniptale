// policyStateIds: [] - preserved preference keys are a static allowlist, not mutable authority.
import {
  LOCAL_EXTENSION_PAGE_STORAGE_KEYS,
  LOCAL_EXTENSION_PAGE_STORAGE_PREFIXES,
} from './inventory';

interface ExtensionPageLocalStorageErasureOptions {
  preservePreferences: boolean;
}

const preservedPreferenceKeys = new Set([
  'sniptale-theme-preference',
  'sniptale-locale-preference',
]);

function shouldRemoveKey(key: string, options: ExtensionPageLocalStorageErasureOptions): boolean {
  if (options.preservePreferences && preservedPreferenceKeys.has(key)) {
    return false;
  }

  return (
    LOCAL_EXTENSION_PAGE_STORAGE_KEYS.includes(
      key as (typeof LOCAL_EXTENSION_PAGE_STORAGE_KEYS)[number]
    ) || LOCAL_EXTENSION_PAGE_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

export function eraseExtensionPageLocalStorage(
  storage: Storage,
  options: ExtensionPageLocalStorageErasureOptions
): string[] {
  const removedKeys: string[] = [];
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (!key || !shouldRemoveKey(key, options)) {
      continue;
    }

    storage.removeItem(key);
    removedKeys.push(key);
  }
  return removedKeys;
}

export function verifyExtensionPageLocalStorageErased(
  storage: Storage,
  options: ExtensionPageLocalStorageErasureOptions
): boolean {
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && shouldRemoveKey(key, options)) {
      return false;
    }
  }
  return true;
}
