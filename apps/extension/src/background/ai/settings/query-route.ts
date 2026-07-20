import type {
  AiSettingsQueryMessage,
  AiSettingsQueryResponse,
} from '../../../contracts/messaging/ai-settings-runtime';
import { aiSettingsQueryMessageSchema } from '../../../contracts/messaging/contracts/ai-settings-schemas';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { BackgroundOwnedRouteContext } from '../../routing-contracts/owned-route-context';
import { resolveAISettingsQueryResponse } from './query-service';

const logger = createLogger({ namespace: 'BackgroundAiSettingsQueryRoute' });

function isAiSettingsQueryMessage(message: unknown): message is AiSettingsQueryMessage {
  return aiSettingsQueryMessageSchema.safeParse(message).success;
}

function hasAISettingsQueryRouteAuthority(
  routeContext: BackgroundOwnedRouteContext | null,
  message: AiSettingsQueryMessage
): boolean {
  return (
    routeContext?.ownerRoute.handlerId === 'ai-settings-query' &&
    routeContext.ownerRoute.messageTypes.includes(message.type) &&
    routeContext.messageBinding.operation === message.operation
  );
}

export function routeAiSettingsQueryMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: ResponseSender<AiSettingsQueryResponse>,
  routeContext: BackgroundOwnedRouteContext | null
): boolean {
  if (!isAiSettingsQueryMessage(message)) {
    return false;
  }

  if (!hasAISettingsQueryRouteAuthority(routeContext, message)) {
    logger.warn('Rejected AI settings query from unauthorized sender', {
      operation: message.operation,
      senderUrl: sender.url,
      tabId: sender.tab?.id,
    });
    sendResponse({ success: false, error: 'Unauthorized AI settings query sender' });
    return true;
  }

  resolveAISettingsQueryResponse(message).then(sendResponse, (error) => {
    logger.error('AI settings query failed', error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : 'AI settings query failed',
    });
  });
  return true;
}
