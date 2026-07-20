import { beforeEach, expect, it, vi } from 'vitest';

import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import type { BrowserStorageChangeListener } from '@sniptale/platform/browser/storage-types';
import {
  createNativeConnect,
  createNativeHello,
  createNativeLease,
  createNativeTestPort,
  installChromeRuntimeInfo,
  waitForNativeSettingsSync,
  type NativeTestPort,
} from './service.test-support';
import { createNativeStorage } from './service-storage.test-support';

const mocks = vi.hoisted(() => ({
  cleanupStaleNativeTransferSessionsMock: vi.fn(),
  getQuickActionsMock: vi.fn(),
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
  listNativeTransferSessions: vi.fn().mockResolvedValue([]),
}));

vi.mock('./ids', () => ({
  createNativeCommandId: (prefix: string) => `${prefix}-1`,
  createNativeConnectionId: () => 'conn-1',
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cleanupStaleNativeTransferSessionsMock.mockResolvedValue([]);
  mocks.getQuickActionsMock.mockResolvedValue([]);
  mocks.loadVideoSettingsMock.mockResolvedValue(DEFAULT_VIDEO_SETTINGS);
  installChromeRuntimeInfo();
});

async function createConnectedService(port = createNativeTestPort()) {
  const { createNativeAppRuntimeService } = await import('./service');
  const service = createNativeAppRuntimeService({
    connectNative: createNativeConnect(port),
    hostName: 'com.sniptale.native_host',
  });
  service.connect();
  return { port, service };
}

function emitAcceptedLease(port: NativeTestPort): void {
  port.emitMessage(createNativeHello());
  port.emitMessage(createNativeLease());
}

function acceptSettings(
  port: NativeTestPort,
  sync: Awaited<ReturnType<typeof waitForNativeSettingsSync>>
) {
  port.emitMessage({
    acceptedAtEpochMs: Date.now(),
    controllerLeaseId: 'lease-1',
    effectiveSettings: {
      screenshots: sync.settings.screenshots,
      video: sync.settings.video,
      warnings: [],
    },
    protocolVersion: 1,
    revision: sync.revision,
    schemaVersion: 1,
    type: 'app.settings.accepted',
    warnings: [],
  });
}

it('ignores settings accepted messages for stale revisions', async () => {
  const { port, service } = await createConnectedService();

  emitAcceptedLease(port);
  const firstSync = await waitForNativeSettingsSync(port, 1);
  expect(firstSync.revision).toMatch(/^settings-sha256-/);

  mocks.loadVideoSettingsMock.mockResolvedValueOnce({
    ...DEFAULT_VIDEO_SETTINGS,
    quality: VideoQuality.LOW,
  });
  await service.syncSettings();

  const secondSync = await waitForNativeSettingsSync(port, 2);
  expect(secondSync.revision).not.toBe(firstSync.revision);

  acceptSettings(port, firstSync);
  await expect(service.getStatus()).resolves.toEqual(
    expect.objectContaining({ effectiveSettings: null, settingsRevision: secondSync.revision })
  );

  acceptSettings(port, secondSync);
  await expect(service.getStatus()).resolves.toEqual(
    expect.objectContaining({
      effectiveSettings: expect.objectContaining({ warnings: [] }),
      settingsRevision: secondSync.revision,
    })
  );
});

it('syncs native shortcut priority after quick-action hotkey changes', async () => {
  const storageListenerRef: { current: BrowserStorageChangeListener | null } = { current: null };
  const port = createNativeTestPort();
  const { createNativeAppRuntimeService } = await import('./service');
  const service = createNativeAppRuntimeService({
    connectNative: createNativeConnect(port),
    hostName: 'com.sniptale.native_host',
    storage: {
      canObserveChanges: () => true,
      local: createNativeStorage().local,
      subscribeToChanges: (listener) => {
        storageListenerRef.current = listener;
        return () => undefined;
      },
    },
  });

  service.connect();
  emitAcceptedLease(port);
  const firstSync = await waitForNativeSettingsSync(port, 1);
  mocks.getQuickActionsMock.mockResolvedValueOnce([
    {
      hotkey: { altKey: false, ctrlKey: true, key: 'ы', metaKey: false, shiftKey: false },
      status: true,
    },
  ]);
  const listener = storageListenerRef.current;
  if (!listener) {
    throw new Error('Expected quick-action storage listener');
  }
  listener({ sniptale_quick_actions: { newValue: [], oldValue: [] } }, 'local');

  const secondSync = await waitForNativeSettingsSync(port, 2);

  expect(secondSync.revision).not.toBe(firstSync.revision);
  expect(secondSync.settings.trayActions.shortcutPriority).toEqual({
    shortcutLabels: ['Ctrl+S'],
    when: 'browser-active',
    winner: 'extension',
  });
});

it('does not publish an empty shortcut priority when quick-action storage fails', async () => {
  const storageListenerRef: { current: BrowserStorageChangeListener | null } = { current: null };
  const port = createNativeTestPort();
  const { createNativeAppRuntimeService } = await import('./service');
  const service = createNativeAppRuntimeService({
    connectNative: createNativeConnect(port),
    hostName: 'com.sniptale.native_host',
    storage: {
      canObserveChanges: () => true,
      local: createNativeStorage().local,
      subscribeToChanges: (listener) => {
        storageListenerRef.current = listener;
        return () => undefined;
      },
    },
  });

  service.connect();
  emitAcceptedLease(port);
  await waitForNativeSettingsSync(port, 1);
  mocks.getQuickActionsMock.mockRejectedValueOnce(new Error('storage unavailable'));
  const listener = storageListenerRef.current;
  if (!listener) {
    throw new Error('Expected quick-action storage listener');
  }
  listener({ sniptale_quick_actions: { newValue: [], oldValue: [] } }, 'local');
  await expect(waitForNativeSettingsSync(port, 2)).rejects.toThrow(
    'Expected 2 native message(s): extension.settings.sync'
  );
});
