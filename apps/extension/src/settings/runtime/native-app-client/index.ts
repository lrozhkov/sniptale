import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  NativeAppMutationOperation,
  NativeAppRuntimeResponse,
} from '../../../contracts/native-app/runtime';
import type { RuntimeMessagingTransport } from '../../../platform/runtime-messaging/transport';

type NativeAppRuntimeTransport = Pick<RuntimeMessagingTransport, 'sendRuntimeMessage'>;

export type NativeAppRuntimeClient = {
  mutate(operation: NativeAppMutationOperation): Promise<NativeAppRuntimeResponse>;
  query(): Promise<NativeAppRuntimeResponse>;
};

function createRequestId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createNativeAppRuntimeClient(
  transport: NativeAppRuntimeTransport
): NativeAppRuntimeClient {
  return {
    mutate(operation) {
      return transport.sendRuntimeMessage({
        operation,
        requestId: createRequestId(`native-${operation}`),
        type: MessageType.NATIVE_APP_MUTATION,
      });
    },
    query() {
      return transport.sendRuntimeMessage({
        requestId: createRequestId('native-query'),
        type: MessageType.NATIVE_APP_QUERY,
      });
    },
  };
}
