import { beforeEach, expect, it, vi } from 'vitest';

import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  createNativeConnect,
  createNativeHello,
  createNativeInstallState,
  createNativeLease,
  createNativeTestPort,
  flushNativeServiceAsync,
  installChromeRuntimeInfo,
  waitForNativePost,
} from './service.test-support';

const mocks = vi.hoisted(() => ({
  cleanupStaleNativeTransferSessionsMock: vi.fn(),
  listNativeTransferSessionsMock: vi.fn(),
  loadVideoSettingsMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/capture-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/capture-settings')>()),
  loadVideoSettings: mocks.loadVideoSettingsMock,
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
  mocks.listNativeTransferSessionsMock.mockResolvedValue([]);
  mocks.loadVideoSettingsMock.mockResolvedValue(DEFAULT_VIDEO_SETTINGS);
  installChromeRuntimeInfo();
});

async function createServiceWithPort() {
  const port = createNativeTestPort();
  const { createNativeAppRuntimeService } = await import('./service');
  const service = createNativeAppRuntimeService({
    connectNative: createNativeConnect(port),
    hostName: 'com.sniptale.native_host',
  });
  return { port, service };
}

it('queues user-requested takeover until hello is accepted', async () => {
  const { port, service } = await createServiceWithPort();

  service.takeController();

  expect(port.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'extension.hello' })
  );
  expect(port.postMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'extension.controller.acquire' })
  );

  port.emitMessage(createNativeHello());
  await expect(waitForNativePost(port, 'extension.controller.acquire')).resolves.toEqual(
    expect.objectContaining({
      reason: 'user-requested-takeover',
      type: 'extension.controller.acquire',
    })
  );
});

it('rejects granted leases for another extension connection before sync or resume', async () => {
  const { port, service } = await createServiceWithPort();

  service.connect();
  port.emitMessage(createNativeHello());
  for (const controller of [
    { ...createNativeLease().controller, connectionId: 'other-connection' },
    { ...createNativeLease().controller, extensionId: 'other-extension' },
  ]) {
    port.emitMessage(createNativeLease({ controller }));
  }
  await flushNativeServiceAsync();

  expect(port.postMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'extension.settings.sync' })
  );
  expect(mocks.listNativeTransferSessionsMock).not.toHaveBeenCalled();
  await expect(service.getStatus()).resolves.toEqual(
    expect.objectContaining({ controllerLease: null })
  );
});

it('ignores non-hello status messages before an accepted handshake', async () => {
  const { port, service } = await createServiceWithPort();

  service.connect();
  port.emitMessage({
    appStatus: {
      connectedBrowser: true,
      install: createNativeInstallState(),
      lastError: null,
      recording: null,
      settingsRevision: null,
    },
    nonce: 'nonce-1',
    protocolVersion: 1,
    sentAtEpochMs: Date.now(),
    type: 'app.pong',
  });
  port.emitMessage({
    controllerLeaseId: 'lease-1',
    error: { code: 'unknown', recoverable: true },
    occurredAtEpochMs: Date.now(),
    operation: 'screenshot',
    phase: 'capture',
    protocolVersion: 1,
    type: 'app.operation.failed',
  });

  await expect(service.getStatus()).resolves.toEqual(
    expect.objectContaining({
      appStatus: null,
      connectionState: 'connecting',
      error: null,
      lastHeartbeatAt: null,
    })
  );
});
