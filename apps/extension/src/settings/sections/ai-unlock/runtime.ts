import type { AISecretUnlockResponse } from '../../../contracts/messaging/ai-secret-unlock';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  createRuntimeMessagingTransport,
  type RuntimeMessagingTransport,
} from '../../../platform/runtime-messaging';

type AISecretUnlockRuntime = {
  cancelRequest(requestId: string): Promise<void>;
  submitPassphrase(args: {
    passphrase: string;
    requestId: string;
  }): Promise<AISecretUnlockResponse>;
};

export function createAISecretUnlockRuntime(
  transport: RuntimeMessagingTransport
): AISecretUnlockRuntime {
  return {
    async cancelRequest(requestId: string): Promise<void> {
      await transport.sendRuntimeMessage({
        requestId,
        type: MessageType.AI_SECRET_UNLOCK,
        operation: 'cancel',
      });
    },
    async submitPassphrase(args: {
      passphrase: string;
      requestId: string;
    }): Promise<AISecretUnlockResponse> {
      return transport.sendRuntimeMessage({
        requestId: args.requestId,
        passphrase: args.passphrase,
        type: MessageType.AI_SECRET_UNLOCK,
        operation: 'submit',
      });
    },
  };
}

export const aiSecretUnlockRuntime = createAISecretUnlockRuntime(createRuntimeMessagingTransport());
