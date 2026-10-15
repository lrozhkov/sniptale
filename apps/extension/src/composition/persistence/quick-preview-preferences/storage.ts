import { browserStorage } from '../infrastructure/browser-storage';
import { tryRunWithPersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { parseCompleteQuickPreviewPreferences, parseQuickPreviewPreferences } from './model';

export const QUICK_PREVIEW_PREFERENCES_STORAGE_KEY = 'sniptale_quick_preview_preferences';

export interface QuickPreviewPreferencesStorage {
  load(): Promise<ReturnType<typeof parseQuickPreviewPreferences>>;
  save(input: unknown): Promise<void>;
}

/** One page-owned ordered store. Erasure refusal and storage failure remain visible to its caller. */
export function createQuickPreviewPreferencesStorage(
  area: Pick<typeof browserStorage.local, 'get' | 'set'> = browserStorage.local
): QuickPreviewPreferencesStorage {
  let writes: Promise<void> = Promise.resolve();
  return {
    async load() {
      const values = await area.get([QUICK_PREVIEW_PREFERENCES_STORAGE_KEY]);
      return parseQuickPreviewPreferences(values[QUICK_PREVIEW_PREFERENCES_STORAGE_KEY]);
    },
    async save(input: unknown): Promise<void> {
      const preferences = parseCompleteQuickPreviewPreferences(input);
      if (!preferences) return Promise.reject(new Error('Invalid quick preview preferences'));
      const previous = writes;
      // Admit now, not after the local queue: admitted writes drain before erasure can remove the key.
      const operation = tryRunWithPersistenceMutationPermit(async (permit) => {
        await previous;
        await area.set({ [QUICK_PREVIEW_PREFERENCES_STORAGE_KEY]: preferences }, permit);
        return true;
      }).then((admitted) => {
        if (admitted === null)
          throw new Error('Quick preview preference save refused during erasure');
      });
      writes = operation.catch(() => undefined);
      return operation;
    },
  };
}
