import type { ContentActionIntentMessage, ContentActionIntentSendMessage } from './types';
import type { RuntimeMessagingTransport } from '../../../platform/runtime-messaging';

export function createContentActionIntentSender(
  messaging: Pick<RuntimeMessagingTransport, 'sendRuntimeMessage'>
): ContentActionIntentSendMessage {
  return (message) =>
    messaging.sendRuntimeMessage(message) as ReturnType<ContentActionIntentSendMessage>;
}

export async function sendContentActionIntentMessage(
  sendMessage: ContentActionIntentSendMessage,
  message: ContentActionIntentMessage
): ReturnType<ContentActionIntentSendMessage> {
  return sendMessage(message);
}
