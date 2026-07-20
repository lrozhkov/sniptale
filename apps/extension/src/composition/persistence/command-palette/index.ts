import { createLogger } from '@sniptale/platform/observability/logger';
import { browserStorage } from '../infrastructure/browser-storage';
import { parseStoredStringList } from '../infrastructure/ui-state-validation';

const MAX_RECENT_ACTIONS = 5;
const logger = createLogger({ namespace: 'CommandPalettePersistence' });

export async function loadRecentCommandPaletteActionIds(storageKey?: string): Promise<string[]> {
  if (!storageKey) return [];
  try {
    const result = await browserStorage.local.get([storageKey]);
    const parsed = parseStoredStringList(result[storageKey], MAX_RECENT_ACTIONS);
    if (parsed.hasInvalidRoot) {
      logger.warn('Ignoring invalid string list payload root from storage', { storageKey });
    }
    if (parsed.invalidEntryCount > 0) {
      logger.warn('Dropped invalid string list entries from storage', {
        invalidEntryCount: parsed.invalidEntryCount,
        storageKey,
      });
    }
    return parsed.value;
  } catch {
    return [];
  }
}

export async function saveRecentCommandPaletteActionIds(
  storageKey: string | undefined,
  actionIds: readonly string[]
): Promise<void> {
  if (!storageKey) return;
  try {
    await browserStorage.local.set({
      [storageKey]: actionIds.slice(0, MAX_RECENT_ACTIONS),
    });
  } catch (error) {
    logger.warn('Failed to save recent command palette action ids', error);
  }
}
