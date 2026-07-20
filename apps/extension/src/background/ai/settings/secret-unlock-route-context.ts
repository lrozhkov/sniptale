import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { AISecretUnlockMessage } from '../../../contracts/messaging/ai-secret-unlock';
import type { BackgroundOwnedRouteContext } from '../../routing-contracts/owned-route-context';

export function hasExplicitAiSecretUnlockContext(
  message: AISecretUnlockMessage,
  routeContext: BackgroundOwnedRouteContext | null | undefined
): boolean {
  return (
    routeContext?.preauthorization.kind === 'ai-secret-unlock-route' &&
    routeContext.messageBinding.type === message.type &&
    routeContext.messageBinding.operation === message.operation &&
    matchesAiSecretUnlockSubject(message, routeContext) &&
    routeContext.ownerRoute.handlerId === 'ai-secret-unlock' &&
    routeContext.ownerRoute.messageTypes.includes(MessageType.AI_SECRET_UNLOCK)
  );
}

function matchesAiSecretUnlockSubject(
  message: AISecretUnlockMessage,
  routeContext: BackgroundOwnedRouteContext
): boolean {
  if (message.operation === 'start') {
    return routeContext.messageBinding.purpose === message.purpose;
  }
  return routeContext.messageBinding.requestId === message.requestId;
}
