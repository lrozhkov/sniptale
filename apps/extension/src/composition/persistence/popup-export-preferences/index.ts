import { createLogger } from '@sniptale/platform/observability/logger';
import { browserStorage } from '../infrastructure/browser-storage';
import { parseStoredPopupExportPreferences } from './guards';
import type { PopupExportPreferences } from './contracts';

export type { PopupExportPreferences } from './contracts';

const STORAGE_KEY = 'sniptale_popup_export_preferences';
const logger = createLogger({ namespace: 'PopupExportPreferences' });

export const DEFAULT_POPUP_EXPORT_PREFERENCES: PopupExportPreferences = {
  includeBasicLogs: false,
  includeCssDiagnostics: false,
  includeFiles: true,
  includeFullPageScreenshot: false,
  includeHarDomLogs: false,
  includeImages: true,
  includeJson: true,
  includeMarkdown: true,
};

export async function loadPopupExportPreferences(): Promise<PopupExportPreferences> {
  try {
    const result = await browserStorage.local.get([STORAGE_KEY]);
    const parsed = parseStoredPopupExportPreferences(result[STORAGE_KEY]);
    if (parsed.hasInvalidRoot) {
      logger.warn('Ignoring invalid popup export preferences payload root from storage');
    }
    if (parsed.invalidFieldCount > 0) {
      logger.warn('Dropped invalid popup export preference fields from storage', {
        invalidFieldCount: parsed.invalidFieldCount,
      });
    }
    return { ...DEFAULT_POPUP_EXPORT_PREFERENCES, ...parsed.value };
  } catch {
    return DEFAULT_POPUP_EXPORT_PREFERENCES;
  }
}

export async function savePopupExportPreferences(
  preferences: PopupExportPreferences
): Promise<void> {
  try {
    await browserStorage.local.set({ [STORAGE_KEY]: preferences });
  } catch (error) {
    logger.warn('Failed to save popup export preferences', error);
    throw error;
  }
}
