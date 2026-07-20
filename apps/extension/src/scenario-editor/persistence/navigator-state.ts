import { createLogger } from '@sniptale/platform/observability/logger';
import { browserStorage } from '../../composition/persistence/infrastructure/browser-storage';
import { loadStoredBooleanFlag } from '../../composition/persistence/infrastructure/ui-state-storage';

const STORAGE_KEY = 'sniptale_scenario_editor_navigator_collapsed';
const logger = createLogger({ namespace: 'ScenarioEditorNavigatorState' });

export async function loadScenarioEditorNavigatorCollapsed(): Promise<boolean> {
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

export async function saveScenarioEditorNavigatorCollapsed(collapsed: boolean): Promise<void> {
  try {
    await browserStorage.local.set({ [STORAGE_KEY]: collapsed });
  } catch (error) {
    logger.warn('Failed to save scenario editor navigator collapsed state', error);
  }
}
