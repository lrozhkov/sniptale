import { createLogger } from '@sniptale/platform/observability/logger';
import { browserStorage } from '../infrastructure/browser-storage';
import { loadStoredBooleanFlag } from '../infrastructure/ui-state-storage';

export type HighlighterAdditionalSettingsSection =
  | 'callout-connector'
  | 'callout-text'
  | 'callout-title';

const STORAGE_KEYS: Record<HighlighterAdditionalSettingsSection, string> = {
  'callout-connector': 'sniptale_highlighter_callout_connector_additional_open',
  'callout-text': 'sniptale_highlighter_callout_text_additional_open',
  'callout-title': 'sniptale_highlighter_callout_title_additional_open',
};

const logger = createLogger({ namespace: 'HighlighterEditorUiState' });

export async function loadHighlighterAdditionalSettingsOpen(
  section: HighlighterAdditionalSettingsSection
): Promise<boolean> {
  return loadStoredBooleanFlag({
    failureMode: 'return-false',
    reportInvalid: (storageKey) => {
      logger.warn('Ignoring invalid additional-settings state from storage', { storageKey });
    },
    storageKey: STORAGE_KEYS[section],
  });
}

export async function saveHighlighterAdditionalSettingsOpen(
  section: HighlighterAdditionalSettingsSection,
  isOpen: boolean
): Promise<void> {
  try {
    await browserStorage.local.set({ [STORAGE_KEYS[section]]: isOpen });
  } catch (error) {
    logger.warn('Failed to save additional-settings state', error);
  }
}
