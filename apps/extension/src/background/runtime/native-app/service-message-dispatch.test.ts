import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeAppRuntimeStatus } from '../../../contracts/native-app/runtime';
import type { NativeAppInboundMessage } from '../../../contracts/native-app';
import type { NativeAppIngestionController } from '../../capture/native-app/controller';
import type { NativeIngestionOutboundMessage } from '../../capture/native-app/ingestion-types';
import {
  createNativeHello,
  createNativeInstallState,
  createNativeLease,
} from './service.test-support';
import { dispatchNativeRuntimeMessage } from './service-message-dispatch';

const mocks = vi.hoisted(() => ({ openSettingsPage: vi.fn() }));

vi.mock('../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/navigation/extension-pages')>()),
  openSettingsPage: mocks.openSettingsPage,
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getManifest: () => ({ version: '0.1.0' }),
    getURL: (path: string) => `chrome-extension://extension-id/${path}`,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.openSettingsPage.mockResolvedValue(undefined);
  Object.assign(globalThis, { chrome: { runtime: { id: 'extension-id' } } });
});

it('dispatches hello and accepted leases through authority state transitions', async () => {
  const ctx = createContext({ pendingReason: 'user-requested-takeover' });

  dispatchNativeRuntimeMessage(ctx, createNativeHello());
  expect(ctx.setHandshakeAccepted).toHaveBeenCalledWith(true);
  expect(ctx.acquire).toHaveBeenCalledWith('user-requested-takeover');

  dispatchNativeRuntimeMessage(ctx, createNativeLease());
  await Promise.resolve();
  expect(ctx.acceptLeaseGeneration).toHaveBeenCalledOnce();
  expect(ctx.sync).toHaveBeenCalledTimes(1);
  expect(ctx.ingestion.resumePendingTransfers).toHaveBeenCalledWith('lease-1');
  expect(ctx.post).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'extension.recording.ack' })
  );
});

it('dispatches settings, pong, open-settings, and early statuses', () => {
  const ctx = createContext();

  dispatchNativeRuntimeMessage(ctx, createSettingsAccepted('stale-revision'));
  expect(ctx.warn).toHaveBeenCalledWith('Settings revision');

  ctx.settingsSync.acceptRevision = vi.fn(() => true);
  dispatchNativeRuntimeMessage(ctx, createSettingsAccepted('settings-revision-1'));
  expect(ctx.setStatus).toHaveBeenCalledWith(
    expect.objectContaining({ settingsRevision: 'settings-revision-1' })
  );

  dispatchNativeRuntimeMessage(ctx, createPong());
  dispatchNativeRuntimeMessage(ctx, createOpenSettingsRequest());
  dispatchNativeRuntimeMessage(ctx, createRecordingProgress());

  expect(mocks.openSettingsPage).toHaveBeenCalledWith({ section: 'native-app' });
});

it('rejects stale lease-owned control messages before side effects', () => {
  const ctx = createContext();

  dispatchNativeRuntimeMessage(ctx, {
    ...createSettingsAccepted('settings-1'),
    controllerLeaseId: 'stale',
  });
  dispatchNativeRuntimeMessage(ctx, { ...createOpenSettingsRequest(), controllerLeaseId: 'stale' });
  dispatchNativeRuntimeMessage(ctx, createTrayActionRequest('stale'));

  expect(ctx.warn).toHaveBeenCalledWith('Stale settings');
  expect(ctx.warn).toHaveBeenCalledWith('Stale open-settings');
  expect(ctx.warn).toHaveBeenCalledWith('Stale tray action');
  expect(mocks.openSettingsPage).not.toHaveBeenCalled();
});

it('dispatches media messages through ingestion and posts async responses', async () => {
  const ctx = createContext();
  vi.mocked(ctx.ingestion.handleRecordingChunk).mockResolvedValueOnce([createRecordingAck()]);

  dispatchNativeRuntimeMessage(ctx, createRecordingChunk());
  await Promise.resolve();

  expect(ctx.ingestion.handleRecordingChunk).toHaveBeenCalledWith(
    expect.objectContaining({ recordingId: 'recording-1' })
  );
  expect(ctx.post).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'extension.recording.ack' })
  );
});

function createContext(
  patch: { consumeInvocation?: boolean; pendingReason?: 'user-requested-takeover' } = {}
) {
  let status = createStatus();
  const ctx = {
    acceptLeaseGeneration: vi.fn(),
    acquire: vi.fn(),
    clearPendingReason: vi.fn(),
    consumeInvocation: vi.fn(() => patch.consumeInvocation ?? true),
    getConnectionId: () => 'conn-1',
    getHandshakeAccepted: () => true,
    getPendingReason: () => patch.pendingReason ?? null,
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
      acceptRevision: vi.fn(() => false),
      invalidate: vi.fn(),
      isCurrent: vi.fn(() => true),
      nextSequence: vi.fn(() => 1),
      setPendingRevision: vi.fn(),
    },
    sync: vi.fn(async () => undefined),
    warn: vi.fn(),
  };
  return ctx;
}

function createIngestion(): NativeAppIngestionController {
  return {
    handleRecordingChunk: vi.fn(async () => []),
    handleRecordingStarted: vi.fn(async () => []),
    handleRecordingStopped: vi.fn(async () => []),
    handleScreenshotChunk: vi.fn(async () => []),
    handleScreenshotCommit: vi.fn(async () => []),
    handleScreenshotStart: vi.fn(async () => []),
    resumePendingTransfers: vi.fn(async () => [createRecordingAck()]),
  };
}

function createRecordingAck(): NativeIngestionOutboundMessage {
  return {
    controllerLeaseId: 'lease-1',
    protocolVersion: 1,
    recordingId: 'recording-1',
    type: 'extension.recording.ack',
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
    trayActions: {
      actions: [
        { enabled: true, id: 'open-settings', kind: 'open-settings', label: 'Open settings' },
      ],
      revision: 'tray-1',
    },
    warnings: [],
  };
}

function createSettingsAccepted(
  revision: string
): Extract<NativeAppInboundMessage, { type: 'app.settings.accepted' }> {
  return {
    acceptedAtEpochMs: 1,
    controllerLeaseId: 'lease-1',
    effectiveSettings: {
      screenshots: { includeCursor: true },
      video: {
        advanced: {
          audioBitrateKbps: 128,
          audioSourceMode: 'system',
          frameRate: 30,
          includeCursorInVideo: true,
          maxDurationMinutes: 120,
          preferHardwareEncoder: true,
          videoBitrateMbpsOverride: null,
        },
        codec: {
          audioCodec: 'aac',
          container: 'mp4',
          hardwareAcceleration: 'prefer',
          videoCodec: 'h264',
        },
        enabled: true,
        telemetry: {
          collectClicks: true,
          collectCursor: true,
          collectKeyEvents: false,
          collectStaticSignals: true,
          collectTypingSpans: true,
        },
      },
      warnings: [],
    },
    protocolVersion: 1,
    revision,
    schemaVersion: 1,
    type: 'app.settings.accepted',
    warnings: [],
  };
}

function createPong() {
  return {
    appStatus: {
      connectedBrowser: true,
      install: createNativeInstallState(),
      lastError: null,
      recording: null,
      settingsRevision: null,
    },
    nonce: 'nonce-1',
    protocolVersion: 1,
    sentAtEpochMs: 1,
    type: 'app.pong',
  } as const;
}

function createOpenSettingsRequest() {
  return {
    controllerLeaseId: 'lease-1',
    invocationId: 'open-1',
    protocolVersion: 1,
    requestedAtEpochMs: 1,
    section: 'native-app',
    type: 'app.openSettings.requested',
  } as const;
}

function createRecordingProgress() {
  return {
    bytesWritten: 3,
    controllerLeaseId: 'lease-1',
    durationMs: 10,
    protocolVersion: 1,
    recordingId: 'recording-1',
    status: 'recording',
    type: 'app.recording.progress',
  } as const;
}

function createTrayActionRequest(controllerLeaseId: string) {
  return {
    actionId: 'open-settings',
    controllerLeaseId,
    invocationId: 'tray-1',
    protocolVersion: 1,
    requestedAtEpochMs: 1,
    type: 'app.tray.actionRequested',
  } as const;
}

function createRecordingChunk() {
  return {
    base64: 'AQID',
    chunkByteOffset: 0,
    chunkIndex: 0,
    chunkRawBytes: 3,
    chunkSha256: '0'.repeat(64),
    controllerLeaseId: 'lease-1',
    protocolVersion: 1,
    recordingId: 'recording-1',
    type: 'app.recording.chunk',
  } as const;
}
