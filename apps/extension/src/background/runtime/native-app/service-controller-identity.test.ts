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
} from './service.test-support';
import { createNativeStorage } from './service-storage.test-support';

const mocks = vi.hoisted(() => ({
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

it('posts acquire with browser identity and a persisted profile key before settings sync', async () => {
  const port = createNativeTestPort();
  const storage = createNativeStorage();
  const { createNativeAppRuntimeService } = await import('./service');
  const service = createNativeAppRuntimeService({
    connectNative: createNativeConnect(port),
    hostName: 'com.sniptale.native_host',
    storage,
  });

  service.connect();
  expect(port.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'extension.hello' })
  );

  port.emitMessage(createNativeHello());
  await expect(waitForNativePost(port, 'extension.controller.acquire')).resolves.toEqual(
    expect.objectContaining({
      browserFamily: expect.stringMatching(/^(chrome|edge|chromium|unknown)$/),
      connectionId: 'conn-1',
      extensionId: 'extension-id',
      profileKey: expect.stringMatching(/^profile:[A-Za-z0-9._:-]+$/),
      reason: 'initial-connect',
    })
  );

  port.emitMessage(createNativeLease());
  await expect(waitForNativePost(port, 'extension.settings.sync')).resolves.toEqual(
    expect.objectContaining({ controllerLeaseId: 'lease-1' })
  );
});

it('reuses the same profile key for reconnect and takeover acquire requests', async () => {
  const firstPort = createNativeTestPort();
  const secondPort = createNativeTestPort();
  const connectNative = vi
    .fn<() => chrome.runtime.Port>()
    .mockReturnValueOnce(firstPort)
    .mockReturnValueOnce(secondPort);
  const storage = createNativeStorage({
    'sniptale.nativeApp.controllerProfileKey': 'profile:stable',
  });
  const { createNativeAppRuntimeService } = await import('./service');
  const service = createNativeAppRuntimeService({
    connectNative,
    hostName: 'com.sniptale.native_host',
    storage,
  });

  service.connect();
  firstPort.emitMessage(createNativeHello());
  const firstAcquire = await waitForNativePost(firstPort, 'extension.controller.acquire');

  service.reconnect();
  secondPort.emitMessage(createNativeHello());
  const reconnectAcquire = await waitForNativePost(secondPort, 'extension.controller.acquire');

  secondPort.emitMessage(createNativeLease());
  service.takeController();
  const takeoverAcquire = await waitForNativePost(secondPort, 'extension.controller.acquire', 2);

  expect([firstAcquire, reconnectAcquire, takeoverAcquire]).toEqual([
    expect.objectContaining({ profileKey: 'profile:stable', reason: 'initial-connect' }),
    expect.objectContaining({ profileKey: 'profile:stable', reason: 'initial-connect' }),
    expect.objectContaining({ profileKey: 'profile:stable', reason: 'user-requested-takeover' }),
  ]);
});

it('does not post stale acquire when profile-key resolution finishes after reconnect', async () => {
  const firstPort = createNativeTestPort();
  const secondPort = createNativeTestPort();
  const connectNative = vi
    .fn<() => chrome.runtime.Port>()
    .mockReturnValueOnce(firstPort)
    .mockReturnValueOnce(secondPort);
  const pendingRead = createDeferred<Record<string, unknown>>();
  const storage = createNativeStorage({
    'sniptale.nativeApp.controllerProfileKey': 'profile:fresh',
  });
  storage.local.get
    .mockReturnValueOnce(pendingRead.promise)
    .mockResolvedValue({ 'sniptale.nativeApp.controllerProfileKey': 'profile:fresh' });
  const { createNativeAppRuntimeService } = await import('./service');
  const service = createNativeAppRuntimeService({
    connectNative,
    hostName: 'com.sniptale.native_host',
    storage,
  });

  service.connect();
  firstPort.emitMessage(createNativeHello());
  service.reconnect();
  secondPort.emitMessage(createNativeHello());
  pendingRead.resolve({ 'sniptale.nativeApp.controllerProfileKey': 'profile:stale' });

  await flushNativeServiceAsync();

  expect(firstPort.postMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'extension.controller.acquire' })
  );
  expect(secondPort.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      connectionId: 'conn-1',
      profileKey: 'profile:fresh',
      type: 'extension.controller.acquire',
    })
  );
});

function createDeferred<TValue>() {
  let resolve!: (value: TValue) => void;
  const promise = new Promise<TValue>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

it('updates status with a typed parse error for malformed inbound messages', async () => {
  const port = createNativeTestPort();
  const { createNativeAppRuntimeService } = await import('./service');
  const service = createNativeAppRuntimeService({
    connectNative: createNativeConnect(port),
    hostName: 'com.sniptale.native_host',
    storage: createNativeStorage(),
  });

  service.connect();
  port.emitMessage(null);

  await expect(service.getStatus()).resolves.toEqual(
    expect.objectContaining({
      connectionState: 'error',
      error: expect.objectContaining({
        code: 'malformed-message',
        recoverable: true,
      }),
    })
  );
});

it('does not send acquire or settings after a compatibility failure', async () => {
  const port = createNativeTestPort();
  const { createNativeAppRuntimeService } = await import('./service');
  const service = createNativeAppRuntimeService({
    connectNative: createNativeConnect(port),
    hostName: 'com.sniptale.native_host',
    storage: createNativeStorage(),
  });

  service.connect();
  port.emitMessage(createNativeHello({ supportedProtocolVersions: [99] }));
  port.emitMessage(createNativeLease());
  await flushNativeServiceAsync();

  expect(port.postMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'extension.controller.acquire' })
  );
  expect(port.postMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'extension.settings.sync' })
  );
  await expect(service.getStatus()).resolves.toEqual(
    expect.objectContaining({ connectionState: 'incompatible-protocol' })
  );
});
