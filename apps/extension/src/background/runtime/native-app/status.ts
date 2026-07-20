import type { NativeAppRuntimeStatus } from '../../../contracts/native-app/runtime';

export function createInitialNativeAppRuntimeStatus(hostName: string): NativeAppRuntimeStatus {
  return {
    appStatus: null,
    capabilities: null,
    connectionState: 'not-connected',
    controllerLease: null,
    effectiveSettings: null,
    error: null,
    hostName,
    install: null,
    lastHeartbeatAt: null,
    lastOperationError: null,
    platform: null,
    settingsRevision: null,
    trayActions: null,
    warnings: [],
  };
}
