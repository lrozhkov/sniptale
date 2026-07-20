import { beforeEach, expect, it, vi } from 'vitest';

import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { reserveNativeIngestionErasureExclusion } from '../../capture/native-app/lifecycle-gate';
import { createRecordingStarted } from '../../capture/native-app/controller.lifecycle-gate.test-support';
import {
  createNativeConnect,
  createNativeHello,
  createNativeLease,
  createNativeTestPort,
  flushNativeServiceAsync,
  installChromeRuntimeInfo,
  waitForNativePost,
} from './service.test-support';

const mocks = vi.hoisted(() => ({
  cleanupStaleNativeTransferSessions: vi.fn(async () => []),
  getQuickActions: vi.fn(async () => []),
  listNativeTransferSessions: vi.fn(async () => []),
  loadVideoSettings: vi.fn(),
  putNativeTransferSession: vi.fn(),
}));

vi.mock('../../capture/native-app/persistence/staging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../capture/native-app/persistence/staging')>()),
  cleanupStaleNativeTransferSessions: mocks.cleanupStaleNativeTransferSessions,
  listNativeTransferSessions: mocks.listNativeTransferSessions,
  putNativeTransferSession: mocks.putNativeTransferSession,
}));
vi.mock('../../../composition/persistence/quick-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/quick-actions')>()),
  getQuickActions: mocks.getQuickActions,
}));
vi.mock('../../../composition/persistence/capture-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/capture-settings')>()),
  loadVideoSettings: mocks.loadVideoSettings,
}));
vi.mock('./ids', () => ({
  createNativeCommandId: (prefix: string) => `${prefix}-1`,
  createNativeConnectionId: () => 'conn-1',
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadVideoSettings.mockResolvedValue(DEFAULT_VIDEO_SETTINGS);
  installChromeRuntimeInfo();
});

it('disconnects and clears native authority before erasure cleanup continues', async () => {
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

  service.quiesceForPrivacyErasure();
  const postsBeforeStaleMessage = port.postMessage.mock.calls.length;
  port.emitMessage(createTrayAction('after-quiesce'));
  await flushNativeServiceAsync();

  expect(port.disconnect).toHaveBeenCalledOnce();
  await expect(service.getStatus()).resolves.toEqual(
    expect.objectContaining({ connectionState: 'not-connected', controllerLease: null })
  );
  expect(port.postMessage).toHaveBeenCalledTimes(postsBeforeStaleMessage);
});

it('invalidates leases from before and during the erasure exclusion generation', async () => {
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

  const exclusion = reserveNativeIngestionErasureExclusion();
  port.emitMessage(createTrayAction('old-lease'));
  port.emitMessage(createNativeLease({ controllerLeaseId: 'lease-during-erasure' }));
  exclusion.release();
  port.emitMessage(createTrayAction('late-message', 'lease-during-erasure'));
  port.emitMessage({
    ...createRecordingStarted('late-recording'),
    controllerLeaseId: 'lease-during-erasure',
  });
  await flushNativeServiceAsync();

  expect(countPosts(port, 'extension.screenshot.capture')).toBe(0);
  expect(mocks.putNativeTransferSession).not.toHaveBeenCalled();
  service.quiesceForPrivacyErasure();
});

function createTrayAction(invocationId: string, controllerLeaseId = 'lease-1') {
  return {
    actionId: 'capture-screenshot-screen',
    controllerLeaseId,
    invocationId,
    protocolVersion: 1,
    requestedAtEpochMs: Date.now(),
    type: 'app.tray.actionRequested',
  } as const;
}

function countPosts(port: ReturnType<typeof createNativeTestPort>, type: string): number {
  return port.postMessage.mock.calls.filter(
    ([message]) =>
      typeof message === 'object' && message !== null && 'type' in message && message.type === type
  ).length;
}
