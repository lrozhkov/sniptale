import { browserTabs } from '@sniptale/platform/browser/tabs';
import { translate } from '../../../platform/i18n/popup';

/**
 * Resolves the current active tab id for popup-driven browser actions.
 */
export async function getActiveTabId(): Promise<number> {
  const [tab] = await browserTabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    throw new Error(translate('popup.common.noActiveTab'));
  }

  return tab.id;
}
