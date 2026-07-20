import { expect, it } from 'vitest';

import type { AppOperationFailedMessage } from '../../../contracts/native-app';
import type { NativeAppRuntimeStatus } from '../../../contracts/native-app/runtime';
import { createNativeHello, createNativeLease } from './service.test-support';
import { applyNativeOperationFailedStatus } from './status-updates';

it('keeps recoverable screenshot transfer failures as operation-level errors', () => {
  const status = createStatus();
  const next = applyNativeOperationFailedStatus(
    status,
    createOperationFailed({
      error: { code: 'unsupported-capability', recoverable: true },
      operation: 'screenshot',
      phase: 'transfer-channel',
    })
  );

  expect(next).toEqual(
    expect.objectContaining({
      capabilities: status.capabilities,
      connectionState: 'connected',
      controllerLease: status.controllerLease,
      error: null,
      lastOperationError: expect.objectContaining({
        operation: 'screenshot',
        phase: 'transfer-channel',
        error: expect.objectContaining({ code: 'unsupported-capability', recoverable: true }),
      }),
      settingsRevision: 'settings-1',
    })
  );
});

it('keeps policy-denied operation failures connection-level', () => {
  expect(
    applyNativeOperationFailedStatus(
      createStatus(),
      createOperationFailed({
        error: { code: 'policy-denied', recoverable: false },
        operation: 'screenshot',
      })
    )
  ).toEqual(
    expect.objectContaining({
      connectionState: 'policy-denied',
      error: expect.objectContaining({ code: 'policy-denied' }),
    })
  );
});

it('keeps connection-level operation failures as runtime errors', () => {
  expect(
    applyNativeOperationFailedStatus(
      createStatus(),
      createOperationFailed({
        error: { code: 'incompatible-protocol', recoverable: true },
        operation: 'handshake',
      })
    )
  ).toEqual(
    expect.objectContaining({
      connectionState: 'error',
      error: expect.objectContaining({ code: 'incompatible-protocol' }),
    })
  );
});

function createStatus(): NativeAppRuntimeStatus {
  const hello = createNativeHello();
  return {
    appStatus: null,
    capabilities: hello.capabilities,
    connectionState: 'connected',
    controllerLease: createNativeLease(),
    effectiveSettings: null,
    error: null,
    hostName: 'com.sniptale.native_host',
    install: hello.install,
    lastHeartbeatAt: 1,
    lastOperationError: null,
    platform: hello.platform,
    settingsRevision: 'settings-1',
    trayActions: null,
    warnings: [],
  };
}

function createOperationFailed(
  patch: Partial<AppOperationFailedMessage> = {}
): AppOperationFailedMessage {
  return {
    controllerLeaseId: 'lease-1',
    error: { code: 'unknown', recoverable: true },
    occurredAtEpochMs: 1,
    operation: 'screenshot',
    phase: 'capture',
    protocolVersion: 1,
    type: 'app.operation.failed',
    ...patch,
  };
}
