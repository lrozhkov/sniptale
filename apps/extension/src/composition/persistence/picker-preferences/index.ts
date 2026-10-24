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
