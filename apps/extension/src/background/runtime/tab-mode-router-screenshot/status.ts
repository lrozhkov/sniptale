import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { translate } from '../../../platform/i18n';
import { getScreenshotModeCapability } from '../../../features/tab-capabilities/capabilities';
import type { ModeState, ViewportState } from '../../routing-contracts/tab-mode-state';

export function buildScreenshotModeStatusResponse(
  tabId: number,
  screenshotModeState: ModeState,
  viewportState: ViewportState,
  sendResponse: ResponseSender,
  senderDocumentId: string | null = null
): boolean {
  const documentScope = senderDocumentId ? { documentId: senderDocumentId } : {};

  browserTabs
    .get(tabId)
    .then((tab) => {
      const capability = getScreenshotModeCapability(tab);
      sendResponse({
        success: true,
        ...documentScope,
        enabled: screenshotModeState.get(tabId) || false,
        tabId,
        viewport: viewportState.get(tabId) || null,
        supported: capability.supported,
        unsupportedReason: capability.reason,
      });
    })
    .catch(() => {
      sendResponse({
        success: true,
        ...documentScope,
        enabled: screenshotModeState.get(tabId) || false,
        tabId,
        viewport: viewportState.get(tabId) || null,
        supported: false,
        unsupportedReason: translate('popup.common.noActiveTab'),
      });
    });

  return true;
}
