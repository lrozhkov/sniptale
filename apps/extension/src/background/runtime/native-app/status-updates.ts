import type {
  AppHelloMessage,
  AppOperationFailedMessage,
  NativeAppInboundMessage,
} from '../../../contracts/native-app';
import type { NativeAppRuntimeStatus } from '../../../contracts/native-app/runtime';
import type { NativeAppConnectionState } from '../../../contracts/native-app/runtime';
import { resolveNativeHandshakeFailure } from './compatibility';

export function clearNativeAuthorityStatus(
  status: NativeAppRuntimeStatus,
  connectionState: NativeAppConnectionState
): NativeAppRuntimeStatus {
  return {
    ...status,
    appStatus: null,
    capabilities: null,
    connectionState,
    controllerLease: null,
    effectiveSettings: null,
    lastHeartbeatAt: null,
    lastOperationError: null,
    settingsRevision: null,
    trayActions: null,
    warnings: [],
  };
}

export function clearNativeControllerStatus(
  status: NativeAppRuntimeStatus
): NativeAppRuntimeStatus {
  return {
    ...status,
    capabilities: null,
    controllerLease: null,
    effectiveSettings: null,
    lastOperationError: null,
    settingsRevision: null,
    trayActions: null,
    warnings: [],
  };
}

export function applyNativeHelloStatus(
  status: NativeAppRuntimeStatus,
  message: AppHelloMessage
): { status: NativeAppRuntimeStatus; shouldAcquireController: boolean } {
  const failureState = resolveNativeHandshakeFailure(message);
  return {
    shouldAcquireController: failureState === null,
    status: {
      ...status,
      capabilities: message.capabilities,
      connectionState: failureState ?? 'connected',
      install: message.install,
      platform: message.platform,
    },
  };
}

export function applyNativeLeaseStatus(
  status: NativeAppRuntimeStatus,
  message: Extract<NativeAppInboundMessage, { type: 'app.controller.lease' }>
): NativeAppRuntimeStatus {
  return {
    ...status,
    connectionState:
      message.status === 'owned-by-other-profile' ? 'controlled-by-other-profile' : 'connected',
    controllerLease: message,
  };
}

export function applyNativeSettingsAcceptedStatus(
  status: NativeAppRuntimeStatus,
  message: Extract<NativeAppInboundMessage, { type: 'app.settings.accepted' }>
): NativeAppRuntimeStatus {
  return {
    ...status,
    effectiveSettings: message.effectiveSettings,
    settingsRevision: message.revision,
    warnings: message.warnings,
  };
}

export function applyNativeOperationFailedStatus(
  status: NativeAppRuntimeStatus,
  message: AppOperationFailedMessage
): NativeAppRuntimeStatus {
  const next = {
    ...status,
    lastOperationError: {
      error: message.error,
      occurredAtEpochMs: message.occurredAtEpochMs,
      operation: message.operation,
      ...(message.operationId === undefined ? {} : { operationId: message.operationId }),
      phase: message.phase,
    },
  };
  if (message.error.code === 'policy-denied') {
    return { ...next, connectionState: 'policy-denied', error: message.error };
  }
  if (
    status.connectionState === 'connected' &&
    message.error.recoverable &&
    !isConnectionLevelOperationFailure(message)
  ) {
    return next;
  }
  return {
    ...next,
    connectionState: 'error',
    error: message.error,
  };
}

function isConnectionLevelOperationFailure(message: AppOperationFailedMessage): boolean {
  return (
    message.operation === 'handshake' ||
    message.operation === 'install-health' ||
    message.error.code === 'app-upgrade-required' ||
    message.error.code === 'extension-upgrade-required' ||
    message.error.code === 'incompatible-protocol' ||
    message.error.code === 'repair-required'
  );
}
