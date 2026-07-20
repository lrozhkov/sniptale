import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  AppOperationFailedMessage,
  AppControllerLeaseMessage,
  NativeAppCapabilities,
  NativeAppError,
  NativeAppStatus,
  NativeEffectiveSettings,
  NativeInstallState,
  NativePlatform,
  NativeSettingsWarning,
  NativeTrayActionRegistry,
} from './types';
import type { NativeCaptureSettings } from '@sniptale/runtime-contracts/video/types/types';

export type NativeAppConnectionState =
  | 'not-connected'
  | 'connecting'
  | 'connected'
  | 'policy-denied'
  | 'missing-host'
  | 'incompatible-protocol'
  | 'incompatible-settings'
  | 'app-upgrade-required'
  | 'extension-upgrade-required'
  | 'controlled-by-other-profile'
  | 'repair-required'
  | 'error';

export interface NativeAppRuntimeStatus {
  capabilities: NativeAppCapabilities | null;
  connectionState: NativeAppConnectionState;
  controllerLease: AppControllerLeaseMessage | null;
  effectiveSettings: NativeEffectiveSettings | null;
  error: NativeAppError | null;
  hostName: string;
  install: NativeInstallState | null;
  lastHeartbeatAt: number | null;
  lastOperationError: NativeAppOperationError | null;
  platform: NativePlatform | null;
  settingsRevision: string | null;
  trayActions: NativeTrayActionRegistry | null;
  warnings: NativeSettingsWarning[];
  appStatus: NativeAppStatus | null;
}

export interface NativeAppOperationError {
  operation: AppOperationFailedMessage['operation'];
  operationId?: string;
  phase: string;
  error: NativeAppError;
  occurredAtEpochMs: number;
}

export interface NativeAppQueryMessage {
  type: typeof MessageType.NATIVE_APP_QUERY;
  requestId: string;
}

export type NativeAppMutationOperation = 'reconnect' | 'take-controller' | 'sync-settings';

export interface NativeAppMutationMessage {
  type: typeof MessageType.NATIVE_APP_MUTATION;
  operation: NativeAppMutationOperation;
  requestId: string;
}

export interface NativeAppRuntimeResponse {
  success: boolean;
  error?: string;
  settings?: NativeCaptureSettings;
  status?: NativeAppRuntimeStatus;
}
