import { browserStorage } from '../../composition/persistence/infrastructure/browser-storage';
import { createLogger } from '@sniptale/platform/observability/logger';

const POPUP_EXPORT_TAB_SELECTION_SESSION_KEY = 'sniptale_popup_export_tab_selection_session';
const logger = createLogger({ namespace: 'PopupExportTabSelectionSession' });

export type PopupExportTabSelectionSession = {
  selectedTabIds: number[];
  tabsFingerprint: string;
};

export function parsePopupExportTabSelectionSession(
  value: unknown
): PopupExportTabSelectionSession | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as {
    selectedTabIds?: unknown;
    tabsFingerprint?: unknown;
  };
  if (typeof candidate.tabsFingerprint !== 'string' || !Array.isArray(candidate.selectedTabIds)) {
    return null;
  }

  const selectedTabIds = candidate.selectedTabIds.filter(
    (tabId): tabId is number => typeof tabId === 'number'
  );

  return {
    selectedTabIds,
    tabsFingerprint: candidate.tabsFingerprint,
  };
}

export async function loadPopupExportTabSelectionSession(): Promise<PopupExportTabSelectionSession | null> {
  try {
    const result = await browserStorage.session.get(POPUP_EXPORT_TAB_SELECTION_SESSION_KEY);

    return parsePopupExportTabSelectionSession(result[POPUP_EXPORT_TAB_SELECTION_SESSION_KEY]);
  } catch (error) {
    logger.warn('Failed to load popup export tab selection session', error);
    return null;
  }
}

export async function savePopupExportTabSelectionSession(
  session: PopupExportTabSelectionSession
): Promise<void> {
  try {
    await browserStorage.session.set({
      [POPUP_EXPORT_TAB_SELECTION_SESSION_KEY]: session,
    });
  } catch (error) {
    logger.warn('Failed to save popup export tab selection session', error);
  }
}
