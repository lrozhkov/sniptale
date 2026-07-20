import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { VideoRuntimeMessage } from '../../../../contracts/video/types/messages';
import {
  isBackgroundInternalSignalMessage,
  isBackgroundTabMessage,
} from '../message-guards/guards/tab';
import { isVideoRuntimeMessage } from '../message-guards/guards/video-runtime';
import type { BackgroundTabMessage, RuntimeMessageEnvelope } from '../message-guards/guards/shared';

export const backgroundOwnedMessageTypes = [
  MessageType.REQUEST_LLM_SESSION,
  MessageType.AI_SETTINGS_QUERY,
  MessageType.AI_SETTINGS_MUTATION,
  MessageType.AI_SECRET_UNLOCK,
  MessageType.NATIVE_APP_QUERY,
  MessageType.NATIVE_APP_MUTATION,
  MessageType.PAGE_ACCESS,
  MessageType.ERASE_LOCAL_EXTENSION_DATA,
  MessageType.STAGE_POPUP_EXPORT_ARCHIVE_CHUNK,
  MessageType.EXPORT_POPUP_SAVE_ARCHIVE,
  MessageType.RELEASE_POPUP_EXPORT_ARCHIVE,
  MessageType.PROCESS_WITH_LLM,
  MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM,
  MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY,
  MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY,
  MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN,
  MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF,
  MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
  MessageType.CONTENT_RUNTIME_WAKEUP,
] as const;

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
  if (isBackgroundInternalSignalMessage(message)) {
    return { kind: 'internal-signal' };
  }

  if (backgroundOwnedMessageTypeSet.has(message.type)) {
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
