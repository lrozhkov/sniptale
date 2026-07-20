import { createLogger } from '@sniptale/platform/observability/logger';
import { browserStorage } from '../../../composition/persistence/infrastructure/browser-storage';
import { loadStoredBooleanFlag } from '../../../composition/persistence/infrastructure/ui-state-storage';

const logger = createLogger({ namespace: 'EditorDocumentDisclosureState' });

export async function loadEditorDocumentActionsDisclosureState(
  storageKey: string
): Promise<boolean> {
  return loadStoredBooleanFlag({
    failureMode: 'throw',
    reportInvalid: (invalidStorageKey) => {
      logger.warn('Ignoring invalid UI state boolean flag from storage', {
        storageKey: invalidStorageKey,
      });
    },
    storageKey,
  });
}

export async function saveEditorDocumentActionsDisclosureState(
  storageKey: string,
  isOpen: boolean
): Promise<void> {
  await browserStorage.local.set({ [storageKey]: isOpen });
}
