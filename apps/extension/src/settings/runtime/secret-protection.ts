import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  AISecretProtectionStatusPayload,
  AiSettingsMutationMessage,
  AiSettingsMutationResponse,
} from '../../contracts/messaging/ai-settings-runtime';
import type { RuntimeMessagingTransport } from '../../platform/runtime-messaging';

type SecretProtectionTransport = Pick<RuntimeMessagingTransport, 'sendRuntimeMessage'>;
type SecretProtectionParticipant = 'ai' | 'webdav';

/** Retains the native command refusal without giving the UI a persistence authority. */
export class SecretProtectionClientError extends Error {
  constructor(
    message: string,
    readonly reason: AiSettingsMutationResponse['reason']
  ) {
    super(message);
    this.name = 'SecretProtectionClientError';
  }
}

/** Creates the Settings-only client for shared protection configuration commands. */
export function createSecretProtectionClient(transport: SecretProtectionTransport) {
  async function send(message: AiSettingsMutationMessage): Promise<AiSettingsMutationResponse> {
    const response = await transport.sendRuntimeMessage(message);
    if (!response.success) {
      throw new SecretProtectionClientError(
        response.error ?? 'Secret protection request failed',
        response.reason
      );
    }
    return response;
  }

  return {
    async readStatus(): Promise<AISecretProtectionStatusPayload> {
      const response = await send({
        type: MessageType.AI_SETTINGS_MUTATION,
        operation: 'read-secret-protection-status',
      });
      if (!response.secretProtectionStatus) {
        throw new SecretProtectionClientError(
          'Secret protection status response is missing',
          undefined
        );
      }
      return response.secretProtectionStatus;
    },
    async enable(participant: SecretProtectionParticipant, passphrase?: string): Promise<void> {
      await send({
        type: MessageType.AI_SETTINGS_MUTATION,
        operation: 'enable-secret-passphrase-protection',
        participant,
        ...(passphrase === undefined ? {} : { passphrase }),
      });
    },
    async disable(participant: SecretProtectionParticipant, passphrase?: string): Promise<void> {
      await send({
        type: MessageType.AI_SETTINGS_MUTATION,
        operation: 'disable-secret-passphrase-protection',
        participant,
        ...(passphrase === undefined ? {} : { passphrase }),
      });
    },
    async unlock(passphrase: string): Promise<void> {
      await send({
        type: MessageType.AI_SETTINGS_MUTATION,
        operation: 'unlock-secret-passphrase-protection',
        passphrase,
      });
    },
    async lock(): Promise<void> {
      await send({
        type: MessageType.AI_SETTINGS_MUTATION,
        operation: 'lock-secret-passphrase-protection',
      });
    },
    async change(args: { currentPassphrase: string; nextPassphrase: string }): Promise<void> {
      await send({
        type: MessageType.AI_SETTINGS_MUTATION,
        operation: 'change-secret-passphrase-protection',
        currentPassphrase: args.currentPassphrase,
        nextPassphrase: args.nextPassphrase,
      });
    },
    async reset(): Promise<void> {
      await send({
        type: MessageType.AI_SETTINGS_MUTATION,
        operation: 'reset-secret-passphrase-protection',
      });
    },
  };
}

/** Narrow command and status dependency used by the common Settings controller. */
export type SecretProtectionClient = ReturnType<typeof createSecretProtectionClient>;
