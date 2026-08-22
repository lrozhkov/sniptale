import { collectBackgroundIngressRouteTypes } from '../../../../contracts/messaging/contracts/runtime';
import type { VideoRuntimeMessage } from '../../../../contracts/video/types/messages';
import {
  isBackgroundInternalSignalMessage,
  isBackgroundTabMessage,
} from '../message-guards/guards/tab';
import { isVideoRuntimeMessage } from '../message-guards/guards/video-runtime';
import type { BackgroundTabMessage, RuntimeMessageEnvelope } from '../message-guards/guards/shared';

const backgroundOwnedMessageTypes = collectBackgroundIngressRouteTypes({
  actionKind: 'background-owned',
});

const backgroundOwnedMessageTypeSet = new Set<string>(backgroundOwnedMessageTypes);

export type RuntimeMessagePreflightRoute =
  | { kind: 'internal-signal' }
  | { kind: 'background-owned' }
  | { kind: 'video-runtime'; message: VideoRuntimeMessage }
  | { kind: 'tab'; tabMessage: BackgroundTabMessage }
  | { kind: 'unknown' };

export function classifyRuntimeMessageRoute(
  message: RuntimeMessageEnvelope
): RuntimeMessagePreflightRoute {
  const messageType = message.type;
  if (isBackgroundInternalSignalMessage(message)) {
    return { kind: 'internal-signal' };
  }

  if (backgroundOwnedMessageTypeSet.has(messageType)) {
    return { kind: 'background-owned' };
  }

  if (isVideoRuntimeMessage(message)) {
    return { kind: 'video-runtime', message };
  }

  if (isBackgroundTabMessage(message)) {
    return { kind: 'tab', tabMessage: message };
  }

  return { kind: 'unknown' };
}
