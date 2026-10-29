import { browserStorage } from '../infrastructure/browser-storage';
import { runWithPersistenceMutationPermit } from '../infrastructure/mutation-barrier';

/** Storage identity shared with the preference-preserving erasure inventory. */
export const PICKER_COMPACT_STORAGE_KEY = 'sniptale_picker_compact';

/** Reading a missing or malformed preference retains the complete editor. */
export async function loadPickerCompact(): Promise<boolean> {
  const stored = await browserStorage.local.get([PICKER_COMPACT_STORAGE_KEY]);
  return stored[PICKER_COMPACT_STORAGE_KEY] === true;
}

/** A scalar preference uses the existing erasure barrier and cross-context lock. */
export function savePickerCompact(compact: boolean): Promise<void> {
  return runWithPersistenceMutationPermit(async (permit) => {
    await browserStorage.local.set({ [PICKER_COMPACT_STORAGE_KEY]: compact }, permit);
  });
}

export function subscribePickerCompact(listener: (compact: boolean) => void): () => void {
  if (!browserStorage.canObserveChanges()) return () => undefined;
  return browserStorage.subscribeToChanges((changes, area) => {
    if (area === 'local' && PICKER_COMPACT_STORAGE_KEY in changes) {
      listener(changes[PICKER_COMPACT_STORAGE_KEY]?.newValue === true);
    }
  });
}

/** Advisory search preference shared by solid and gradient color editors. */
export const PICKER_CATALOG_STORAGE_KEY = 'sniptale_picker_catalog';

export async function loadPickerCatalog(): Promise<boolean> {
  const stored = await browserStorage.local.get([PICKER_CATALOG_STORAGE_KEY]);
  return stored[PICKER_CATALOG_STORAGE_KEY] === true;
}

export function savePickerCatalog(enabled: boolean): Promise<void> {
  return runWithPersistenceMutationPermit(async (permit) => {
    await browserStorage.local.set({ [PICKER_CATALOG_STORAGE_KEY]: enabled }, permit);
  });
}

export function subscribePickerCatalog(listener: (enabled: boolean) => void): () => void {
  if (!browserStorage.canObserveChanges()) return () => undefined;
  return browserStorage.subscribeToChanges((changes, area) => {
    if (area === 'local' && PICKER_CATALOG_STORAGE_KEY in changes) {
      listener(changes[PICKER_CATALOG_STORAGE_KEY]?.newValue === true);
    }
  });
}
