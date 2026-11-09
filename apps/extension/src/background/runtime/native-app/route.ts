import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  NativeAppMutationMessage,
  NativeAppRuntimeResponse,
} from '../../../contracts/native-app/runtime';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { getNativeAppRuntimeService } from './service-singleton';
import { hasNativeMessagingPermission } from './permission-lifecycle';

function isNativeQueryMessage(
  message: unknown
): message is { type: typeof MessageType.NATIVE_APP_QUERY } {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === MessageType.NATIVE_APP_QUERY
  );
}

function isNativeMutationMessage(message: unknown): message is NativeAppMutationMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === MessageType.NATIVE_APP_MUTATION &&
    'operation' in message
  );
}

async function buildResponse(): Promise<NativeAppRuntimeResponse> {
  return {
    status: await getNativeAppRuntimeService().getStatus(),
    success: true,
  };
}

function sendAsyncResponse(
  operation: () => Promise<NativeAppRuntimeResponse>,
  sendResponse: ResponseSender<NativeAppRuntimeResponse>
): void {
  operation().then(sendResponse, (error) => {
    sendResponse({
      error: error instanceof Error ? error.message : 'Native app runtime failed',
      success: false,
    });
  });
}

async function runNativeMutation(
  message: NativeAppMutationMessage
): Promise<NativeAppRuntimeResponse> {
  if (!(await hasNativeMessagingPermission())) {
    return {
      error: 'Native app access is required.',
      success: false,
    };
  }

  const service = getNativeAppRuntimeService();
  if (message.operation === 'reconnect') {
    await service.reconnect();
  } else if (message.operation === 'trust-client' && message.clientId) {
    await service.trustClient(message.clientId);
  } else if (message.operation === 'forget-client') {
    await service.forgetClient();
  } else {
    return { success: false, error: 'Unsupported Desktop connection operation' };
  }
  return buildResponse();
}

export function routeNativeAppRuntimeMessage(
  message: unknown,
  _sender: chrome.runtime.MessageSender,
  sendResponse: ResponseSender<NativeAppRuntimeResponse>
): boolean {
  if (isNativeQueryMessage(message)) {
    sendAsyncResponse(buildResponse, sendResponse);
    return true;
  }

  if (!isNativeMutationMessage(message)) {
    return false;
  }

  sendAsyncResponse(() => runNativeMutation(message), sendResponse);
  return true;
}
