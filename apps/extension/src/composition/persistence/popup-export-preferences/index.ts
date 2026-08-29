import { createLogger } from '@sniptale/platform/observability/logger';
import { browserStorage } from '../infrastructure/browser-storage';
import { parseStoredPopupPagePackagePreferences } from './guards';
import type {
  PopupExportPreferences,
  PopupPagePackagePreferences,
  PopupPagePackageSelection,
} from './contracts';

export type {
  PopupExportPreferences,
  PopupPagePackagePreferences,
  PopupPagePackageSelection,
} from './contracts';

export const POPUP_PAGE_PACKAGE_PREFERENCES_STORAGE_KEY = 'sniptale_popup_page_package_preferences';
const logger = createLogger({ namespace: 'PopupExportPreferences' });

export const DEFAULT_POPUP_EXPORT_PREFERENCES: PopupExportPreferences = {
  includeAnnotations: false,
  includeBasicLogs: false,
  includeCssDiagnostics: false,
  includeFiles: true,
  includeFullPageScreenshot: false,
  includeViewportScreenshot: false,
  includePageDiagnostics: false,
  includeImages: true,
  includeJson: true,
  includeMarkdown: true,
};

const EMPTY_STRUCTURED_SELECTION: PopupExportPreferences = {
  includeAnnotations: false,
  includeBasicLogs: false,
  includeCssDiagnostics: false,
  includeFiles: false,
  includeFullPageScreenshot: false,
  includeViewportScreenshot: false,
  includePageDiagnostics: false,
  includeImages: false,
  includeJson: false,
  includeMarkdown: false,
};

export const DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES: PopupPagePackagePreferences = {
  export: {
    ...DEFAULT_POPUP_EXPORT_PREFERENCES,
    includeWebCopy: false,
  },
  save: {
    ...EMPTY_STRUCTURED_SELECTION,
    includeFullPageScreenshot: true,
    includeWebCopy: true,
  },
};

function clonePagePackageSelection(
  selection: PopupPagePackageSelection
): PopupPagePackageSelection {
  return { ...selection };
}

function clonePagePackagePreferences(
  preferences: PopupPagePackagePreferences
): PopupPagePackagePreferences {
  return {
    export: clonePagePackageSelection(preferences.export),
    save: clonePagePackageSelection(preferences.save),
  };
}

export async function loadPopupPagePackagePreferences(): Promise<PopupPagePackagePreferences> {
  try {
    const result = await browserStorage.local.get([POPUP_PAGE_PACKAGE_PREFERENCES_STORAGE_KEY]);
    const parsed = parseStoredPopupPagePackagePreferences(
      result[POPUP_PAGE_PACKAGE_PREFERENCES_STORAGE_KEY]
    );
    if (!parsed && result[POPUP_PAGE_PACKAGE_PREFERENCES_STORAGE_KEY] !== undefined) {
      logger.warn('Ignoring invalid popup page-package preferences from storage');
    }
    return clonePagePackagePreferences(parsed ?? DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES);
  } catch {
    return clonePagePackagePreferences(DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES);
  }
}

export async function savePopupPagePackagePreferences(
  preferences: PopupPagePackagePreferences
): Promise<void> {
  if (
    (preferences.export.includeWebCopy && !preferences.export.includeFullPageScreenshot) ||
    preferences.save.includeWebCopy !== true ||
    preferences.save.includeFullPageScreenshot !== true
  ) {
    throw new Error('Web-copy package preferences must include the full-page screenshot');
  }

  try {
    await browserStorage.local.set({
      [POPUP_PAGE_PACKAGE_PREFERENCES_STORAGE_KEY]: {
        schemaVersion: 1,
        export: preferences.export,
        save: preferences.save,
      },
    });
  } catch (error) {
    logger.warn('Failed to save popup page-package preferences', error);
    throw error;
  }
}

export async function loadPopupExportPreferences(): Promise<PopupExportPreferences> {
  const preferences = await loadPopupPagePackagePreferences();
  const { includeWebCopy: _includeWebCopy, ...exportPreferences } = preferences.export;
  return exportPreferences;
}
