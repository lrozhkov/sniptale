import { createLogger } from '@sniptale/platform/observability/logger';
import { browserStorage } from '../../../../composition/persistence/infrastructure/browser-storage';
import { loadStoredBooleanFlag } from '../../../../composition/persistence/infrastructure/ui-state-storage';

const STORAGE_KEY = 'sniptale_ai_modal_spoiler_open';
const logger = createLogger({ namespace: 'ContentAiSpoilerState' });

export async function loadSpoilerState(): Promise<boolean> {
  return loadStoredBooleanFlag({
    failureMode: 'return-false',
    reportInvalid: (storageKey) => {
      logger.warn('Ignoring invalid UI state boolean flag from storage', {
        storageKey,
      });
    },
    storageKey: STORAGE_KEY,
  });
}

export async function saveSpoilerState(isOpen: boolean): Promise<void> {
  try {
    await browserStorage.local.set({ [STORAGE_KEY]: isOpen });
  } catch (error) {
    logger.warn('Failed to save spoiler state', error);
  }
}
