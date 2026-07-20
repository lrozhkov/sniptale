import { browserNativeMessaging } from '@sniptale/platform/browser/native-messaging';
import { browserStorage } from '../../../composition/persistence/infrastructure/browser-storage';
import { resolveNativeHostName } from './host';
import type { NativeAppRuntimeServiceDeps } from './service-types';

export type ResolvedNativeRuntimeServiceDeps = Required<
  Pick<NativeAppRuntimeServiceDeps, 'connectNative' | 'hostName' | 'storage'>
>;

export function resolveNativeRuntimeServiceDeps(
  deps: Partial<NativeAppRuntimeServiceDeps>
): ResolvedNativeRuntimeServiceDeps {
  return {
    connectNative: deps.connectNative ?? browserNativeMessaging.connectNative,
    hostName: deps.hostName ?? resolveNativeHostName(),
    storage: deps.storage ?? browserStorage,
  };
}
