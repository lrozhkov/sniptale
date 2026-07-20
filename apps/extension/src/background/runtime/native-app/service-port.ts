import type { browserNativeMessaging } from '@sniptale/platform/browser/native-messaging';
import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import { MIN_SUPPORTED_EXTENSION_VERSION } from '../../../contracts/native-app';
import { createNativeHelloMessage } from './outbound';
import type { NativeControllerAcquireReason } from './service-types';

export function openNativeRuntimePort(args: {
  connectNative: typeof browserNativeMessaging.connectNative;
  handleDisconnect: (port: chrome.runtime.Port) => void;
  handleMessage: (message: unknown, port: chrome.runtime.Port) => void;
  hostName: string;
  reason: NativeControllerAcquireReason;
  setPendingReason: (reason: NativeControllerAcquireReason) => void;
}): chrome.runtime.Port {
  const port = args.connectNative(args.hostName);
  port.onMessage.addListener(args.handleMessage);
  port.onDisconnect.addListener(() => args.handleDisconnect(port));
  port.postMessage(
    createNativeHelloMessage({
      extensionId: chrome.runtime.id,
      extensionVersion: runtimeInfo.getManifest().version ?? MIN_SUPPORTED_EXTENSION_VERSION,
    })
  );
  if (args.reason !== 'initial-connect') {
    args.setPendingReason(args.reason);
  }
  return port;
}
