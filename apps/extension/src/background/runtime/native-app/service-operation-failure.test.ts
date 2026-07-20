import { beforeEach, expect, it, vi } from 'vitest';

import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  createNativeConnect,
  createNativeHello,
  createNativeLease,
  createNativeTestPort,
  installChromeRuntimeInfo,
  waitForNativePost,
  waitForNativeSettingsSync,
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

it('keeps connection status after recoverable screenshot transfer-channel failure', async () => {
  const { connectNative, port, service } = await createConnectedService();

  const revision = await acceptNativeSettings(port);
  emitScreenshotFailure(port);

  await expect(service.getStatus()).resolves.toEqual(
    expect.objectContaining({
      connectionState: 'connected',
      controllerLease: expect.objectContaining({ controllerLeaseId: 'lease-1' }),
      error: null,
      lastOperationError: expect.objectContaining({
        operation: 'screenshot',
        operationId: 'screenshot-1',
        phase: 'transfer-channel',
      }),
      settingsRevision: revision,
    })
  );
  expect(connectNative).toHaveBeenCalledTimes(1);
});

async function createConnectedService() {
  const port = createNativeTestPort();
  const connectNative = createNativeConnect(port);
  const { createNativeAppRuntimeService } = await import('./service');
  const service = createNativeAppRuntimeService({
    connectNative,
    hostName: 'com.sniptale.native_host',
    storage: createNativeStorage({ 'sniptale.nativeApp.controllerProfileKey': 'profile:stable' }),
  });

  service.connect();
  port.emitMessage(createNativeHello());
  await waitForNativePost(port, 'extension.controller.acquire');
  port.emitMessage(createNativeLease());
  return { connectNative, port, service };
}

async function acceptNativeSettings(
  port: ReturnType<typeof createNativeTestPort>
): Promise<string> {
  const settingsSync = await waitForNativeSettingsSync(port);
  port.emitMessage({
    acceptedAtEpochMs: Date.now(),
    controllerLeaseId: 'lease-1',
    effectiveSettings: {
      ...DEFAULT_VIDEO_SETTINGS.native,
      warnings: [],
    },
    protocolVersion: 1,
    revision: settingsSync.revision,
    schemaVersion: settingsSync.schemaVersion,
    type: 'app.settings.accepted',
    warnings: [],
  });
  return settingsSync.revision;
}

function emitScreenshotFailure(port: ReturnType<typeof createNativeTestPort>): void {
  port.emitMessage({
    acceptedAtEpochMs: Date.now(),
    commandId: 'screenshot-1',
    controllerLeaseId: 'lease-1',
    operation: 'screenshot',
    protocolVersion: 1,
    type: 'app.command.accepted',
  });
  port.emitMessage({
    controllerLeaseId: 'lease-1',
    error: { code: 'unsupported-capability', recoverable: true },
    occurredAtEpochMs: Date.now(),
    operation: 'screenshot',
    operationId: 'screenshot-1',
    phase: 'transfer-channel',
    protocolVersion: 1,
    type: 'app.operation.failed',
  });
}
