import type { AISecretProtectionStatusPayload } from '../../../../contracts/messaging/ai-settings-runtime';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { sendRuntimeMessage } from '../../../../platform/runtime-messaging';

export async function requestAISecretProtectionStatus(): Promise<AISecretProtectionStatusPayload> {
  const response = await sendRuntimeMessage({
    operation: 'read-secret-protection-status',
    type: MessageType.AI_SETTINGS_MUTATION,
  });
  if (!response.secretProtectionStatus) {
    throw new Error('AI secret protection status request failed');
  }
  return response.secretProtectionStatus;
}
