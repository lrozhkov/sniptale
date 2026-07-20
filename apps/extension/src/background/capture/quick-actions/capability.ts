import { translate } from '../../../platform/i18n/index';
import { createLogger } from '@sniptale/platform/observability/logger';
import { getQuickActionCapability } from '../../../features/tab-capabilities/capabilities';

const logger = createLogger({ namespace: 'BackgroundQuickActions' });

export function assertQuickActionSupported(
  actionId: string,
  tabId: number,
  tab: chrome.tabs.Tab
): void {
  const quickActionCapability = getQuickActionCapability(tab);
  if (quickActionCapability.supported) {
    return;
  }

  logger.warn('Unsupported tab for popup screenshot action', { actionId, tabId, url: tab.url });
  throw new Error(quickActionCapability.reason || translate('popup.home.triggerQuickActionError'));
}
