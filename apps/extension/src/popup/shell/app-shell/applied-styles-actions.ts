import { PAGE_STYLE_INSPECTOR_TABS } from '@sniptale/runtime-contracts/page-style';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { getPopupResponseErrorMessage } from '../../diagnostics/runtime-errors';
import { getActiveTabId } from '../tab-access';
import { getPopupRuntimeServices } from '../runtime/services';

export async function getCurrentPageAppliedStyleCount(): Promise<number> {
  const tabId = await getActiveTabId();
  const response = await getPopupRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY,
    tabId,
  });

  if (response?.success === false) {
    throw new Error(getPopupResponseErrorMessage(response, 'popup.common.stalePageRuntimeHint'));
  }

  return response?.summary?.activeAppliedCount ?? 0;
}

export async function openAppliedPageStyles() {
  const tabId = await getActiveTabId();
  const enableResponse = await getPopupRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.ENABLE_SCREENSHOT_MODE,
    tabId,
  });

  if (enableResponse?.success === false) {
    throw new Error(getPopupResponseErrorMessage(enableResponse, 'popup.home.openPrepError'));
  }

  const quickEditResponse = await getPopupRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.ENABLE_QUICK_EDIT_MODE,
    tabId,
  });

  if (quickEditResponse?.success === false) {
    throw new Error(getPopupResponseErrorMessage(quickEditResponse, 'popup.home.openPrepError'));
  }

  const inspectorResponse = await getPopupRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.OPEN_PAGE_STYLE_INSPECTOR,
    tabId,
    targetTab: PAGE_STYLE_INSPECTOR_TABS.RULES,
  });

  if (inspectorResponse?.success === false) {
    throw new Error(getPopupResponseErrorMessage(inspectorResponse, 'popup.home.openPrepError'));
  }

  window.close();
}
