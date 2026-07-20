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
  cleanupStaleNativeTransferSessions: vi.fn(),
  getQuickActions: vi.fn(),
  listNativeTransferSessions: vi.fn(),
  loadVideoSettings: vi.fn(),
}));

vi.mock('../../../composition/persistence/capture-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/capture-settings')>()),
  loadVideoSettings: mocks.loadVideoSettings,
}));

vi.mock('../../../composition/persistence/quick-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/quick-actions')>()),
  getQuickActions: mocks.getQuickActions,
}));

vi.mock('../../capture/native-app/persistence/staging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../capture/native-app/persistence/staging')>()),
  cleanupStaleNativeTransferSessions: mocks.cleanupStaleNativeTransferSessions,
  listNativeTransferSessions: mocks.listNativeTransferSessions,
}));

vi.mock('./ids', () => ({
  createNativeCommandId: (prefix: string) => `${prefix}-1`,
  createNativeConnectionId: () => 'conn-1',
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cleanupStaleNativeTransferSessions.mockResolvedValue([]);
  mocks.getQuickActions.mockResolvedValue([]);
  mocks.listNativeTransferSessions.mockResolvedValue([]);
  mocks.loadVideoSettings.mockResolvedValue(DEFAULT_VIDEO_SETTINGS);
  installChromeRuntimeInfo();
});

it('ignores stale disconnects from an old native port after reconnect', async () => {
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
  firstPort.emitDisconnect();
  firstPort.emitMessage(createNativeHello());

  expect(countPosts(secondPort, 'extension.controller.acquire')).toBe(0);
  secondPort.emitMessage(createNativeHello());

  await expect(waitForNativePost(secondPort, 'extension.controller.acquire')).resolves.toEqual(
    expect.objectContaining({ type: 'extension.controller.acquire' })
  );
  await expect(service.getStatus()).resolves.toEqual(
    expect.objectContaining({ connectionState: 'connected' })
  );
});

it('marks the runtime connected after hello and keeps it connected after the granted lease', async () => {
  const port = createNativeTestPort();
  const { createNativeAppRuntimeService } = await import('./service');
  const service = createNativeAppRuntimeService({
    connectNative: createNativeConnect(port),
    hostName: 'com.sniptale.native_host',
  });

  service.connect();
  port.emitMessage(createNativeHello());
  await expect(service.getStatus()).resolves.toEqual(
    expect.objectContaining({ connectionState: 'connected' })
  );

  port.emitMessage(createNativeLease());
  await expect(service.getStatus()).resolves.toEqual(
    expect.objectContaining({
      connectionState: 'connected',
      controllerLease: expect.objectContaining({ controllerLeaseId: 'lease-1' }),
    })
  );
});

it('pings the native app and reconnects only after a stale heartbeat timeout', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
  try {
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
      storage: createNativeStorage({
        'sniptale.nativeApp.controllerProfileKey': 'profile:heartbeat',
      }),
    });

    service.connect();
    vi.advanceTimersByTime(15_000);
    expect(countPosts(firstPort, 'extension.ping')).toBe(1);

    firstPort.emitMessage(createNativeHello());
    vi.advanceTimersByTime(30_000);
    firstPort.emitMessage(createPong());
    vi.advanceTimersByTime(45_000);

    expect(connectNative).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(15_000);
    expect(firstPort.disconnect).toHaveBeenCalledTimes(1);
    expect(connectNative).toHaveBeenCalledTimes(2);

    secondPort.emitMessage(createNativeHello());
    await flushNativeMicrotasks();
    expect(secondPort.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'stale-controller-recovery',
        type: 'extension.controller.acquire',
      })
    );
    secondPort.emitDisconnect();
  } finally {
    vi.useRealTimers();
  }
});

it('rejects duplicate and stale native control invocations before command side effects', async () => {
  const port = createNativeTestPort();
  const { createNativeAppRuntimeService } = await import('./service');
  const service = createNativeAppRuntimeService({
    connectNative: createNativeConnect(port),
    hostName: 'com.sniptale.native_host',
  });

  service.connect();
  port.emitMessage(createNativeHello());
  port.emitMessage(createNativeLease());
  await waitForNativePost(port, 'extension.settings.sync');

  port.emitMessage(createTrayAction('tray-1', Date.now()));
  await flushNativeServiceAsync();
  port.emitMessage(createTrayAction('tray-1', Date.now()));
  port.emitMessage(createTrayAction('tray-old', Date.now() - 600_000));
  await flushNativeServiceAsync();

  expect(countPosts(port, 'extension.screenshot.capture')).toBe(1);
  expect(countPosts(port, 'extension.tray.actionResult')).toBe(1);
});

function createTrayAction(invocationId: string, requestedAtEpochMs: number) {
  return {
    actionId: 'capture-screenshot-screen',
    controllerLeaseId: 'lease-1',
    invocationId,
    protocolVersion: 1,
    requestedAtEpochMs,
    type: 'app.tray.actionRequested',
  } as const;
}

async function flushNativeMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createPong() {
  return {
    appStatus: {
      connectedBrowser: true,
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
      lastError: null,
      recording: null,
      settingsRevision: null,
    },
    nonce: 'ping-1',
    protocolVersion: 1,
    sentAtEpochMs: Date.now(),
    type: 'app.pong',
  } as const;
}

function countPosts(port: ReturnType<typeof createNativeTestPort>, type: string): number {
  return port.postMessage.mock.calls
    .map(([message]) => message)
    .filter((message) => hasType(message, type)).length;
}

function hasType(message: unknown, type: string): boolean {
  return (
    typeof message === 'object' && message !== null && 'type' in message && message.type === type
  );
}
