import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  SettingsTransferMessage,
  SettingsTransferOperation,
  SettingsTransferResponse,
} from '../../../contracts/settings-transfer';
import type { RuntimeMessagingTransport } from '../../../platform/runtime-messaging';

export class SettingsTransferClientError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'SettingsTransferClientError';
  }
}

type SettingsTransferClientMessage = SettingsTransferMessage extends infer TMessage
  ? TMessage extends { type: unknown }
    ? Omit<TMessage, 'type'>
    : never
  : never;

type SettingsTransferTransport = Pick<RuntimeMessagingTransport, 'sendRuntimeMessage'>;

export function createSettingsTransferClient(transport: SettingsTransferTransport) {
  return async function sendSettingsTransferOperation<TOperation extends SettingsTransferOperation>(
    message: Extract<SettingsTransferClientMessage, { operation: TOperation }>
  ): Promise<Extract<SettingsTransferResponse, { success: true; operation: TOperation }>> {
    const response = (await transport.sendRuntimeMessage({
      ...message,
      type: MessageType.SETTINGS_TRANSFER,
    } as SettingsTransferMessage)) as SettingsTransferResponse;
    if (response.operation !== message.operation)
      throw new SettingsTransferClientError(
        'operation-mismatch',
        'Settings transfer response operation does not match the request'
      );
    if (!response.success)
      throw new SettingsTransferClientError(response.errorCode, response.error);
    return response as Extract<SettingsTransferResponse, { success: true; operation: TOperation }>;
  };
}
