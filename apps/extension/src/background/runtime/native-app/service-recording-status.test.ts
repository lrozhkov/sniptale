import { expect, it, vi } from 'vitest';

import type { NativeAppRuntimeStatus } from '../../../contracts/native-app/runtime';
import { updateNativeRecordingStatus } from './service-recording-status';

it('updates native recording status for the current controller lease', () => {
  const setStatus = vi.fn();
  const status = createStatus();

  updateNativeRecordingStatus(
    createContext({ setStatus, status }),
    { controllerLeaseId: 'lease-1', recordingId: 'recording-1' },
    'recording',
    500
  );

  expect(setStatus).toHaveBeenCalledWith(
    expect.objectContaining({
      appStatus: expect.objectContaining({
        recording: { durationMs: 500, recordingId: 'recording-1', status: 'recording' },
      }),
    })
  );
});

it('rejects early, stale, and install-less recording status updates', () => {
  const warn = vi.fn();
  const setStatus = vi.fn();
  const message = { controllerLeaseId: 'lease-1', recordingId: 'recording-1' };

  updateNativeRecordingStatus(
    createContext({ handshakeAccepted: false, setStatus, warn }),
    message,
    'paused',
    1
  );
  updateNativeRecordingStatus(
    createContext({ ownsLease: false, setStatus, warn }),
    message,
    'stopping',
    1
  );
  updateNativeRecordingStatus(
    createContext({
      setStatus,
      status: { ...createStatus(), appStatus: null, install: null },
      warn,
    }),
    message,
    'finalizing',
    1
  );

  expect(setStatus).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledWith('Early status');
  expect(warn).toHaveBeenCalledWith('Stale recording status');
  expect(warn).toHaveBeenCalledWith('Missing install status');
});

function createContext(args: {
  handshakeAccepted?: boolean;
  ownsLease?: boolean;
  setStatus: (status: NativeAppRuntimeStatus) => void;
  status?: NativeAppRuntimeStatus;
  warn?: (message: string) => void;
}) {
  return {
    getHandshakeAccepted: () => args.handshakeAccepted ?? true,
    getStatus: () => args.status ?? createStatus(),
    ownsLease: () => args.ownsLease ?? true,
    setStatus: args.setStatus,
    warn: args.warn ?? vi.fn(),
  };
}

function createStatus(): NativeAppRuntimeStatus {
  return {
    appStatus: null,
    capabilities: null,
    connectionState: 'connected',
    controllerLease: {
      controller: {
        browserFamily: 'chrome',
        connectionId: 'conn-1',
        extensionId: 'extension-id',
        profileKey: 'profile-1',
      },
      controllerLeaseId: 'lease-1',
      expiresAtEpochMs: 10,
      protocolVersion: 1,
      status: 'granted',
      type: 'app.controller.lease',
    },
    effectiveSettings: null,
    error: null,
    hostName: 'com.sniptale.native_host',
    install: {
      appCacheSchemaVersion: 1,
      appVersion: '0.1.0',
      autostart: { enabled: true, method: 'windows-hkcu-run', supported: true },
      installerVersion: '0.1.0',
      nativeHostManifestVersion: '0.1.0',
      packageIntegrity: 'valid',
      platform: { arch: 'x64', kind: 'windows', version: '11' },
      rollbackProtected: true,
      signedBinary: true,
      updateChannel: 'stable',
    },
    lastHeartbeatAt: null,
    lastOperationError: null,
    platform: { arch: 'x64', kind: 'windows', version: '11' },
    settingsRevision: 'settings-1',
    trayActions: null,
    warnings: [],
  };
}
