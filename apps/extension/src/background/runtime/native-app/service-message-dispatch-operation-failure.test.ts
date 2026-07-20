import { expect, it, vi } from 'vitest';

import type { NativeAppRuntimeStatus } from '../../../contracts/native-app/runtime';
import type { NativeAppIngestionController } from '../../capture/native-app/controller';
import { dispatchNativeRuntimeMessage } from './service-message-dispatch';

it('dispatches recoverable operation failures without changing connection state', () => {
  const ctx = createContext();

  dispatchNativeRuntimeMessage(ctx, {
    controllerLeaseId: 'lease-1',
    error: { code: 'unsupported-capability', recoverable: true },
    occurredAtEpochMs: 1,
    operation: 'screenshot',
    phase: 'transfer-channel',
    protocolVersion: 1,
    type: 'app.operation.failed',
  });

  expect(ctx.setStatus).toHaveBeenCalledWith(
    expect.objectContaining({
      connectionState: 'connected',
      lastOperationError: expect.objectContaining({
        operation: 'screenshot',
        phase: 'transfer-channel',
      }),
    })
  );
});

function createContext() {
  let status = createStatus();
  return {
    acceptLeaseGeneration: vi.fn(),
    acquire: vi.fn(),
    clearPendingReason: vi.fn(),
    consumeInvocation: vi.fn(),
    getConnectionId: () => 'conn-1',
    getHandshakeAccepted: () => true,
    getPendingReason: () => null,
    getStatus: () => status,
    ingestion: createIngestion(),
    notePong: vi.fn(),
    ownsLease: ({ controllerLeaseId }: { controllerLeaseId: string }) =>
      controllerLeaseId === 'lease-1',
    post: vi.fn(),
    setHandshakeAccepted: vi.fn(),
    setStatus: vi.fn((next: NativeAppRuntimeStatus) => {
      status = next;
    }),
    settingsSync: {
      acceptRevision: vi.fn(),
      invalidate: vi.fn(),
      isCurrent: vi.fn(),
      nextSequence: vi.fn(),
      setPendingRevision: vi.fn(),
    },
    sync: vi.fn(async () => undefined),
    warn: vi.fn(),
  };
}

function createIngestion(): NativeAppIngestionController {
  return {
    handleRecordingChunk: vi.fn(async () => []),
    handleRecordingStarted: vi.fn(async () => []),
    handleRecordingStopped: vi.fn(async () => []),
    handleScreenshotChunk: vi.fn(async () => []),
    handleScreenshotCommit: vi.fn(async () => []),
    handleScreenshotStart: vi.fn(async () => []),
    resumePendingTransfers: vi.fn(async () => []),
  };
}

function createStatus(): NativeAppRuntimeStatus {
  return {
    appStatus: null,
    capabilities: null,
    connectionState: 'connected',
    controllerLease: null,
    effectiveSettings: null,
    error: null,
    hostName: 'com.sniptale.native_host',
    install: null,
    lastHeartbeatAt: null,
    lastOperationError: null,
    platform: null,
    settingsRevision: null,
    trayActions: null,
    warnings: [],
  };
}
