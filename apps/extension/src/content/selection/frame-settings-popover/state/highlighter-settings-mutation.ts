import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { RuntimeMessagingTransport } from '../../../../platform/runtime-messaging';

export async function requestDefaultBorderPresetMutation(
  messaging: Pick<RuntimeMessagingTransport, 'sendRuntimeMessage'>,
  presetId: string
): Promise<void> {
  const response = await messaging.sendRuntimeMessage({
    operation: 'set-default-border-preset',
    presetId,
    type: MessageType.HIGHLIGHTER_SETTINGS_MUTATION,
  });
  if (!response.success) {
    throw new Error(response.error ?? 'Highlighter settings mutation failed');
  }
}
