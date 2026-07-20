import { browserTabs } from '@sniptale/platform/browser/tabs';
import { classifyTabRuntimeCapability } from '../../../features/tab-capabilities/runtime';
import { TabRuntimeCapability } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import type { RuntimeRequestByType } from '../../../contracts/messaging/contracts/runtime-message';
import { respondAsyncRouteWithLogger } from '../../routing-contracts/response';
import { getBackgroundRuntimeMessaging } from '../../routing-contracts/runtime-messaging/services';

type BackgroundPageStyleMessage =
  | RuntimeRequestByType[typeof MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY]
  | RuntimeRequestByType[typeof MessageType.OPEN_PAGE_STYLE_INSPECTOR];

export const pageStyleRuntimeMessageTypes = [
  MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY,
  MessageType.OPEN_PAGE_STYLE_INSPECTOR,
] as const satisfies ReadonlyArray<BackgroundPageStyleMessage['type']>;

export function isPageStyleRuntimeMessage(message: {
  type: string;
}): message is BackgroundPageStyleMessage {
  return pageStyleRuntimeMessageTypes.includes(message.type as BackgroundPageStyleMessage['type']);
}

export function routePageStyleRuntimeMessage(args: {
  logger: { error: (...value: unknown[]) => void };
  message: BackgroundPageStyleMessage;
  resolvedTabId: number;
  sendResponse: ResponseSender;
}): void {
  respondAsyncRouteWithLogger({
    work: dispatchPageStyleRuntimeMessage(args.resolvedTabId, args.message),
    sendResponse: args.sendResponse,
    logger: args.logger,
    failureLogMessage: 'Page style runtime request failed',
    fallbackMessage: 'Page style runtime request failed',
  });
}

async function dispatchPageStyleRuntimeMessage(
  resolvedTabId: number,
  message: BackgroundPageStyleMessage
) {
  const tab = await browserTabs.get(resolvedTabId);
  if (classifyTabRuntimeCapability(tab) !== TabRuntimeCapability.Regular) {
    return { success: true, result: 'accepted' };
  }

  return getBackgroundRuntimeMessaging().sendTabMessage(resolvedTabId, message);
}
