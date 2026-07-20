import type { browserNativeMessaging } from '@sniptale/platform/browser/native-messaging';
import type { BrowserStorageAdapter } from '@sniptale/platform/browser/storage-types';
import type { NativeAppRuntimeStatus } from '../../../contracts/native-app/runtime';

export type NativeControllerAcquireReason =
  | 'initial-connect'
  | 'user-requested-takeover'
  | 'stale-controller-recovery';

export interface NativeAppRuntimeServiceDeps {
  connectNative: typeof browserNativeMessaging.connectNative;
  hostName: string;
  storage?: Pick<BrowserStorageAdapter, 'canObserveChanges' | 'local' | 'subscribeToChanges'>;
}

export interface NativeAppRuntimeService {
  connect(reason?: NativeControllerAcquireReason): void;
  getStatus(): Promise<NativeAppRuntimeStatus>;
  quiesceForPrivacyErasure(): void;
  reconnect(): void;
  syncSettings(): Promise<void>;
  takeController(): void;
}
