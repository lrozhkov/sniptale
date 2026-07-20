import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeAppRuntimeStatus } from '../../../contracts/native-app/runtime';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { handleNativeTrayAction } from './tray-actions';
import { createNativeTrayActionCapabilities } from './tray-actions.test-support';

const mocks = vi.hoisted(() => ({
  loadNativeSettingsSnapshot: vi.fn(),
}));

vi.mock('../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/navigation/extension-pages')>()),
  openGalleryPage: vi.fn(),
  openSettingsPage: vi.fn(),
  openVideoEditorPage: vi.fn(),
}));

vi.mock('./ids', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ids')>()),
  createNativeCommandId: (prefix: string) => `${prefix}-1`,
}));

vi.mock('./settings-snapshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./settings-snapshot')>()),
  createNativeRequestedQualitySettings: vi.fn(() => ({
    audioBitrateKbps: 128,
    audioSourceMode: 'system',
    frameRate: 30,
    quality: VideoQuality.MEDIUM,
    videoBitrateMbpsOverride: null,
  })),
  loadNativeSettingsSnapshot: mocks.loadNativeSettingsSnapshot,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

it('revalidates recording tray actions after async settings load', async () => {
  const post = vi.fn();
  let currentStatus = createStatus();
  const deferredSnapshot = createDeferredSnapshot();
  mocks.loadNativeSettingsSnapshot.mockReturnValueOnce(deferredSnapshot.promise);

  const pending = handleNativeTrayAction({
    getStatus: () => currentStatus,
    message: createActionRequest('start-recording-region'),
    post,
    status: currentStatus,
  });
  currentStatus = createStatus({
    capabilities: createNativeTrayActionCapabilities({ videoModes: ['screen'] }),
    controllerLease: null,
    trayActions: null,
  });
  deferredSnapshot.resolve({
    native: {},
    quality: VideoQuality.MEDIUM,
    revision: 'settings-revision-2',
  });
  await pending;

  expect(post).toHaveBeenCalledWith(
    expect.objectContaining({
      accepted: false,
      error: 'Unavailable or stale tray action',
      type: 'extension.tray.actionResult',
    })
  );
  expect(post).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'extension.recording.start' })
  );
});

function createActionRequest(actionId: string) {
  return {
    actionId,
    controllerLeaseId: 'lease-1',
    invocationId: `${actionId}-1`,
    protocolVersion: 1,
    requestedAtEpochMs: Date.now(),
    type: 'app.tray.actionRequested' as const,
  };
}

function createDeferredSnapshot() {
  let resolve!: (value: { native: unknown; quality: VideoQuality; revision: string }) => void;
  const promise = new Promise<{ native: unknown; quality: VideoQuality; revision: string }>(
    (complete) => {
      resolve = complete;
    }
  );
  return { promise, resolve };
}

function createStatus(patch: Partial<NativeAppRuntimeStatus> = {}): NativeAppRuntimeStatus {
  return {
    appStatus: null,
    capabilities: createNativeTrayActionCapabilities(),
    connectionState: 'connected',
    controllerLease: {
      controller: {
        browserFamily: 'chrome',
        connectionId: 'conn-1',
        extensionId: 'extension-id',
        profileKey: 'profile-1',
      },
      controllerLeaseId: 'lease-1',
      expiresAtEpochMs: Date.now() + 60_000,
      protocolVersion: 1,
      status: 'granted',
      type: 'app.controller.lease',
    },
    effectiveSettings: null,
    error: null,
    hostName: 'com.sniptale.native_host',
    install: null,
    lastHeartbeatAt: null,
    lastOperationError: null,
    platform: null,
    settingsRevision: 'settings-revision-1',
    trayActions: {
      actions: [
        { enabled: true, id: 'start-recording-region', kind: 'start-recording', label: 'Start' },
      ],
      revision: 'tray-revision-1',
    },
    warnings: [],
    ...patch,
  };
}
