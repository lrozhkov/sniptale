import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { enableQuickEditMode } from '../../../selection/quick-edit';
import {
  getPageStyleCurrentRuleSummary,
  openPageStyleInspector,
} from '../../../selection/quick-edit/page-style';
import type { ContentRuntimeHandlerResult, ContentRuntimeMessage } from '../types';
import { isPageStyleMessage } from '../types';

export function handlePageStyleMessage(
  message: ContentRuntimeMessage,
  sendResponse: ResponseSender
): ContentRuntimeHandlerResult {
  if (!isPageStyleMessage(message)) {
    return null;
  }

  if (message.type === MessageType.OPEN_PAGE_STYLE_INSPECTOR) {
    enableQuickEditMode();
    openPageStyleInspector(message.targetTab);
    sendResponse({ success: true });
    return false;
  }

  return handleCurrentRuleSummaryMessage(sendResponse);
}

function handleCurrentRuleSummaryMessage(sendResponse: ResponseSender): true {
  void getPageStyleCurrentRuleSummary()
    .then((summary) => {
      sendResponse({ success: true, summary });
    })
    .catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Page style summary failed';
      sendResponse({ success: false, error: errorMessage });
    });

  return true;
}
