import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  AiSettingsNavigationMessage,
  AiSettingsNavigationResponse,
} from '../../../contracts/messaging/contracts/runtime-message/ai.types';
import { openSettingsPage } from '../../../platform/navigation/extension-pages';
import { respondAsyncSuccess } from '../../routing-contracts/response';
import type { BackgroundOwnedRouteContext } from '../../routing-contracts/owned-route-context';
import { isContentPrivilegedActionCapability } from '@sniptale/runtime-contracts/protocol/content-privileged-action';

function isAiSettingsNavigationMessage(value: unknown): value is AiSettingsNavigationMessage {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Record<string, unknown>;
  return (
    message['type'] === MessageType.AI_SETTINGS_NAVIGATION &&
    (message['section'] === 'ai-connections' || message['section'] === 'ai-prompts') &&
    isContentPrivilegedActionCapability(message['contentIntent']) &&
    Object.keys(message).length === 3
  );
}

function hasNavigationAuthority(
  routeContext: BackgroundOwnedRouteContext | null,
  message: AiSettingsNavigationMessage
): boolean {
  return (
    routeContext?.ownerRoute.handlerId === 'ai-settings-navigation' &&
    routeContext.ownerRoute.messageTypes.includes(message.type) &&
    routeContext.messageBinding.type === message.type
  );
}

export function routeAiSettingsNavigationMessage(
  message: unknown,
  sendResponse: ResponseSender<AiSettingsNavigationResponse>,
  routeContext: BackgroundOwnedRouteContext | null
): boolean {
  if (!isAiSettingsNavigationMessage(message)) return false;
  if (!hasNavigationAuthority(routeContext, message)) {
    sendResponse({ success: false, error: 'Unauthorized AI settings navigation sender' });
    return true;
  }

  respondAsyncSuccess(openSettingsPage({ route: { section: message.section } }), sendResponse);
  return true;
}
