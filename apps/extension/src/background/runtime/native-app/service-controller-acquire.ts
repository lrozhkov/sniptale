import type { BrowserStorageAdapter } from '@sniptale/platform/browser/storage-types';
import type { NativeAppRuntimeStatus } from '../../../contracts/native-app/runtime';
import { resolveNativeControllerIdentity } from './controller-identity';
import { createNativeControllerAcquireMessage } from './outbound';
import type { NativeControllerAcquireReason } from './service-types';
import { applyNativeAcquireIdentityError } from './service-status-errors';

export async function postNativeControllerAcquire(args: {
  connectionId: string;
  extensionId: string;
  getConnectionId: () => string;
  getPort: () => chrome.runtime.Port | null;
  port: chrome.runtime.Port | null;
  reason: NativeControllerAcquireReason;
  storage: Pick<BrowserStorageAdapter, 'local'>;
  updateStatus: (updater: (status: NativeAppRuntimeStatus) => NativeAppRuntimeStatus) => void;
}): Promise<void> {
  try {
    const identity = await resolveNativeControllerIdentity({
      connectionId: args.connectionId,
      extensionId: args.extensionId,
      storage: args.storage,
    });
    if (!isCurrentAcquire(args)) {
      return;
    }
    args.port?.postMessage(createNativeControllerAcquireMessage({ identity, reason: args.reason }));
  } catch {
    if (isCurrentAcquire(args)) {
      args.updateStatus(applyNativeAcquireIdentityError);
    }
  }
}

function isCurrentAcquire(args: {
  connectionId: string;
  getConnectionId: () => string;
  getPort: () => chrome.runtime.Port | null;
  port: chrome.runtime.Port | null;
}): boolean {
  return args.port === args.getPort() && args.connectionId === args.getConnectionId();
}
