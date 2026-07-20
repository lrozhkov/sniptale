import { beforeEach, expect, it, vi } from 'vitest';

import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  createNativeConnect,
  createNativeHello,
  createNativeLease,
  createNativeTestPort,
  flushNativeServiceAsync,
  installChromeRuntimeInfo,
  waitForNativePost,
  type NativeTestPort,
} from './service.test-support';

const mocks = vi.hoisted(() => ({
  browserTabsCreateMock: vi.fn(),
  cleanupStaleNativeTransferSessionsMock: vi.fn(),
  getQuickActionsMock: vi.fn(),
  listNativeTransferSessionsMock: vi.fn(),
  loadVideoSettingsMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/capture-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/capture-settings')>()),
  loadVideoSettings: mocks.loadVideoSettingsMock,
}));

vi.mock('../../../composition/persistence/quick-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/quick-actions')>()),
  getQuickActions: mocks.getQuickActionsMock,
}));

vi.mock('../../capture/native-app/persistence/staging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../capture/native-app/persistence/staging')>()),
  cleanupStaleNativeTransferSessions: mocks.cleanupStaleNativeTransferSessionsMock,
  listNativeTransferSessions: mocks.listNativeTransferSessionsMock,
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { create: mocks.browserTabsCreateMock },
}));

vi.mock('./ids', () => ({
  createNativeCommandId: (prefix: string) => `${prefix}-1`,
  createNativeConnectionId: () => 'conn-1',
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cleanupStaleNativeTransferSessionsMock.mockResolvedValue([]);
  mocks.getQuickActionsMock.mockResolvedValue([]);
  mocks.listNativeTransferSessionsMock.mockResolvedValue([]);
  mocks.loadVideoSettingsMock.mockResolvedValue(DEFAULT_VIDEO_SETTINGS);
  installChromeRuntimeInfo();
});

async function createConnectedService(port = createNativeTestPort()) {
  const connectNative = createNativeConnect(port);
  const { createNativeAppRuntimeService } = await import('./service');
  const service = createNativeAppRuntimeService({
    connectNative,
    hostName: 'com.sniptale.native_host',
  });
  service.connect();
  return { connectNative, port, service };
}

function emitAcceptedLease(port: NativeTestPort): void {
  port.emitMessage(createNativeHello());
  port.emitMessage(createNativeLease());
}

function stagePendingRecordingSession(): void {
  mocks.listNativeTransferSessionsMock.mockResolvedValue([
    {
      chunkCount: 2,
      controllerLeaseId: 'lease-1',
      createdAt: 1,
      expiresAt: Date.now() + 60_000,
      filename: 'recording.mp4',
      id: 'recording-1',
      kind: 'recording',
      metadata: { height: 720, openEditor: false, width: 1280 },
      mimeType: 'video/mp4',
      receivedBytes: 4,
      receivedChunkIndexes: [0],
      sha256: '0'.repeat(64),
      totalBytes: 8,
      updatedAt: 2,
    },
  ]);
}

it('connects to the configured host, handshakes, acquires controller, and syncs settings', async () => {
  const { connectNative, port, service } = await createConnectedService();

  expect(connectNative).toHaveBeenCalledWith('com.sniptale.native_host');
  expect(port.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'extension.hello' })
  );

  port.emitMessage(createNativeHello());
  await expect(waitForNativePost(port, 'extension.controller.acquire')).resolves.toEqual(
    expect.objectContaining({ reason: 'initial-connect', type: 'extension.controller.acquire' })
  );

  port.emitMessage(createNativeLease());
  await expect(waitForNativePost(port, 'extension.settings.sync')).resolves.toEqual(
    expect.objectContaining({
      controllerLeaseId: 'lease-1',
      schemaVersion: 1,
      type: 'extension.settings.sync',
    })
  );
  await expect(service.getStatus()).resolves.toEqual(
    expect.objectContaining({
      connectionState: 'connected',
      controllerLease: expect.objectContaining({ controllerLeaseId: 'lease-1' }),
    })
  );
});

it('ignores stale open-settings requests and resumes pending recording transfers for the granted lease', async () => {
  stagePendingRecordingSession();
  const { port } = await createConnectedService();

  emitAcceptedLease(port);
  await flushNativeServiceAsync();

  expect(port.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      chunkIndex: 1,
      recordingId: 'recording-1',
      type: 'extension.recording.chunkRequest',
    })
  );

  port.emitMessage({
    controllerLeaseId: 'other-lease',
    invocationId: 'open-1',
    protocolVersion: 1,
    requestedAtEpochMs: Date.now(),
    section: 'native-app',
    type: 'app.openSettings.requested',
  });
  expect(mocks.browserTabsCreateMock).not.toHaveBeenCalled();
});

it('does not accept controller leases or operations after an incompatible handshake', async () => {
  const { port } = await createConnectedService();

  port.emitMessage({
    ...createNativeHello(),
    supportedProtocolVersions: [99],
  });
  port.emitMessage(createNativeLease());
  await flushNativeServiceAsync();

  expect(port.postMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'extension.settings.sync' })
  );
  expect(port.postMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'extension.recording.chunkRequest' })
  );

  port.emitMessage({
    controllerLeaseId: 'lease-1',
    invocationId: 'open-1',
    protocolVersion: 1,
    requestedAtEpochMs: Date.now(),
    section: 'native-app',
    type: 'app.openSettings.requested',
  });
  expect(mocks.browserTabsCreateMock).not.toHaveBeenCalled();
});

it('surfaces native startup failures as missing-host status', async () => {
  const { createNativeAppRuntimeService } = await import('./service');
  const connectNative = vi.fn<() => chrome.runtime.Port>(() => {
    throw new Error('host missing');
  });
  const service = createNativeAppRuntimeService({
    connectNative,
    hostName: 'com.sniptale.native_host',
  });

  service.connect();

  await expect(service.getStatus()).resolves.toEqual(
    expect.objectContaining({
      connectionState: 'missing-host',
      error: expect.objectContaining({ message: 'host missing' }),
    })
  );
});

it('reconnects with a new port and maps policy disconnects', async () => {
  const firstPort = createNativeTestPort();
  const secondPort = createNativeTestPort();
  const connectNative = vi
    .fn<() => chrome.runtime.Port>()
    .mockReturnValueOnce(firstPort)
    .mockReturnValueOnce(secondPort);
  const { createNativeAppRuntimeService } = await import('./service');
  const service = createNativeAppRuntimeService({
    connectNative,
    hostName: 'com.sniptale.native_host',
  });

  service.connect();
  service.reconnect();

  expect(firstPort.disconnect).toHaveBeenCalledTimes(1);
  expect(connectNative).toHaveBeenCalledTimes(2);
  expect(secondPort.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'extension.hello' })
  );

  Object.assign(globalThis.chrome.runtime, { lastError: { message: 'policy blocked' } });
  secondPort.emitDisconnect();

  await expect(service.getStatus()).resolves.toEqual(
    expect.objectContaining({ connectionState: 'policy-denied' })
  );
});

it('queues takeover until handshake and ignores duplicate connect calls', async () => {
  const port = createNativeTestPort();
  const connectNative = createNativeConnect(port);
  const { createNativeAppRuntimeService } = await import('./service');
  const service = createNativeAppRuntimeService({
    connectNative,
    hostName: 'com.sniptale.native_host',
  });

  service.connect();
  service.connect();
  service.takeController();
  port.emitMessage(createNativeHello());

  expect(connectNative).toHaveBeenCalledTimes(1);
  await expect(waitForNativePost(port, 'extension.controller.acquire')).resolves.toEqual(
    expect.objectContaining({
      reason: 'user-requested-takeover',
      type: 'extension.controller.acquire',
    })
  );
});

it('opens the native port from direct takeover and maps ordinary disconnects', async () => {
  const port = createNativeTestPort();
  const connectNative = createNativeConnect(port);
  const { createNativeAppRuntimeService } = await import('./service');
  const service = createNativeAppRuntimeService({
    connectNative,
    hostName: 'com.sniptale.native_host',
  });

  service.takeController();
  port.emitMessage(createNativeHello());
  await expect(waitForNativePost(port, 'extension.controller.acquire')).resolves.toEqual(
    expect.objectContaining({
      reason: 'user-requested-takeover',
      type: 'extension.controller.acquire',
    })
  );
  port.emitDisconnect();

  await expect(service.getStatus()).resolves.toEqual(
    expect.objectContaining({ connectionState: 'missing-host' })
  );
});

it('ignores malformed native messages and takes controller after handshake', async () => {
  const { port, service } = await createConnectedService();

  port.emitMessage(null);
  port.emitMessage(createNativeHello());
  service.takeController();

  await flushNativeServiceAsync();
  expect(port.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      reason: 'user-requested-takeover',
      type: 'extension.controller.acquire',
    })
  );
});
