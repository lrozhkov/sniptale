import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  NativeAppMutationMessage,
  NativeAppRuntimeResponse,
} from '../../../contracts/native-app/runtime';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { loadVideoSettings } from '../../../composition/persistence/capture-settings';
import { getNativeAppRuntimeService } from './service-singleton';
import { normalizeNativeCaptureSettings } from './settings-snapshot';

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
  const settings = await loadVideoSettings();
  return {
    settings: normalizeNativeCaptureSettings(settings.native, settings.quality),
    status: await getNativeAppRuntimeService().getStatus(),
    success: true,
  };
}

function sendAsyncResponse(sendResponse: ResponseSender<NativeAppRuntimeResponse>): void {
  buildResponse().then(sendResponse, (error) => {
    sendResponse({
      error: error instanceof Error ? error.message : 'Native app runtime failed',
      success: false,
    });
  });
}

export function routeNativeAppRuntimeMessage(
  message: unknown,
  _sender: chrome.runtime.MessageSender,
  sendResponse: ResponseSender<NativeAppRuntimeResponse>
): boolean {
  if (isNativeQueryMessage(message)) {
    sendAsyncResponse(sendResponse);
    return true;
  }

  if (!isNativeMutationMessage(message)) {
    return false;
  }

  const service = getNativeAppRuntimeService();
  if (message.operation === 'reconnect') {
    service.reconnect();
  } else if (message.operation === 'take-controller') {
    service.takeController();
  } else {
    void service.syncSettings();
  }
  sendAsyncResponse(sendResponse);
  return true;
}
