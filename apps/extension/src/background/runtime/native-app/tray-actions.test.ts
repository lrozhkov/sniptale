import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeAppRuntimeStatus } from '../../../contracts/native-app/runtime';
import type { NativeInstallState } from '../../../contracts/native-app';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { handleNativeTrayAction } from './tray-actions';
import { createNativeTrayActionCapabilities } from './tray-actions.test-support';

const mocks = vi.hoisted(() => ({
  openGalleryPage: vi.fn(),
  openSettingsPage: vi.fn(),
  openVideoEditorPage: vi.fn(),
}));

vi.mock('../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/navigation/extension-pages')>()),
  openGalleryPage: mocks.openGalleryPage,
  openSettingsPage: mocks.openSettingsPage,
  openVideoEditorPage: mocks.openVideoEditorPage,
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
  loadNativeSettingsSnapshot: vi.fn(async () => ({
    native: {},
    quality: VideoQuality.MEDIUM,
    revision: 'settings-revision-1',
  })),
}));

function createInstallState(): NativeInstallState {
  return {
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
  };
}

function createStatus(patch: Partial<NativeAppRuntimeStatus> = {}): NativeAppRuntimeStatus {
  return {
    appStatus: null,
    capabilities: null,
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
        { enabled: true, id: 'open-settings', kind: 'open-settings', label: 'Open settings' },
        { enabled: true, id: 'open-gallery', kind: 'open-gallery', label: 'Open gallery' },
        { enabled: true, id: 'open-video-editor', kind: 'open-video-editor', label: 'Open editor' },
        {
          enabled: true,
          id: 'capture-screenshot-region',
          kind: 'capture-screenshot',
          label: 'Capture',
        },
        { enabled: true, id: 'start-recording-region', kind: 'start-recording', label: 'Start' },
        { enabled: true, id: 'stop-recording', kind: 'stop-recording', label: 'Stop recording' },
      ],
      revision: 'tray-revision-1',
    },
    warnings: [],
    ...patch,
  };
}

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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.openGalleryPage.mockResolvedValue(undefined);
  mocks.openSettingsPage.mockResolvedValue(undefined);
  mocks.openVideoEditorPage.mockResolvedValue(undefined);
});

it('rejects recording controls when no active recording can receive the command', async () => {
  const post = vi.fn();

  await handleNativeTrayAction({
    message: createActionRequest('stop-recording'),
    post,
    status: createStatus(),
  });

  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith(
    expect.objectContaining({
      accepted: false,
      error: 'Recording is not active',
      type: 'extension.tray.actionResult',
    })
  );
  expect(post).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'extension.recording.control' })
  );
});

it('posts recording controls and accepts only when an active recording exists', async () => {
  const post = vi.fn();

  await handleNativeTrayAction({
    message: createActionRequest('stop-recording'),
    post,
    status: createStatus({
      appStatus: {
        connectedBrowser: true,
        install: createInstallState(),
        lastError: null,
        recording: {
          durationMs: 500,
          recordingId: 'recording-1',
          status: 'recording',
        },
        settingsRevision: 'settings-revision-1',
      },
    }),
  });

  expect(post).toHaveBeenCalledWith(
    expect.objectContaining({ recordingId: 'recording-1', type: 'extension.recording.control' })
  );
  expect(post).toHaveBeenCalledWith(
    expect.objectContaining({ accepted: true, type: 'extension.tray.actionResult' })
  );
});

it('rejects page-open tray actions when the page cannot be opened', async () => {
  const post = vi.fn();
  mocks.openSettingsPage.mockRejectedValueOnce(new Error('open failed'));

  await handleNativeTrayAction({
    message: createActionRequest('open-settings'),
    post,
    status: createStatus(),
  });

  expect(post).toHaveBeenCalledWith(
    expect.objectContaining({
      accepted: false,
      error: 'Failed to open settings',
      type: 'extension.tray.actionResult',
    })
  );
});

it('accepts page-open tray actions after opening their pages', async () => {
  const post = vi.fn();

  await handleNativeTrayAction({
    message: createActionRequest('open-gallery'),
    post,
    status: createStatus(),
  });
  await handleNativeTrayAction({
    message: createActionRequest('open-video-editor'),
    post,
    status: createStatus(),
  });

  expect(mocks.openGalleryPage).toHaveBeenCalledTimes(1);
  expect(mocks.openVideoEditorPage).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith(
    expect.objectContaining({ accepted: true, type: 'extension.tray.actionResult' })
  );
});

it('posts screenshot and recording start commands from tray actions', async () => {
  const post = vi.fn();

  await handleNativeTrayAction({
    message: createActionRequest('capture-screenshot-region'),
    post,
    status: createStatus(),
  });
  await handleNativeTrayAction({
    message: createActionRequest('start-recording-region'),
    post,
    status: createStatus({ settingsRevision: null }),
  });

  expect(post).toHaveBeenCalledWith(
    expect.objectContaining({ mode: 'region', type: 'extension.screenshot.capture' })
  );
  expect(post).toHaveBeenCalledWith(
    expect.objectContaining({ source: { mode: 'region' }, type: 'extension.recording.start' })
  );
});

it('rejects screenshot and recording tray actions outside native app capabilities', async () => {
  const post = vi.fn();
  const status = createStatus({
    capabilities: createNativeTrayActionCapabilities({
      screenshotModes: ['screen'],
      videoModes: ['screen'],
    }),
  });

  await handleNativeTrayAction({
    message: createActionRequest('capture-screenshot-region'),
    post,
    status,
  });
  await handleNativeTrayAction({
    message: createActionRequest('start-recording-region'),
    post,
    status,
  });

  expect(post).toHaveBeenCalledWith(
    expect.objectContaining({
      accepted: false,
      error: 'Screenshot mode is unavailable',
      type: 'extension.tray.actionResult',
    })
  );
  expect(post).toHaveBeenCalledWith(
    expect.objectContaining({
      accepted: false,
      error: 'Recording mode is unavailable',
      type: 'extension.tray.actionResult',
    })
  );
  expect(post).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'extension.screenshot.capture' })
  );
  expect(post).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'extension.recording.start' })
  );
});

it('rejects disabled or stale tray actions before dispatch', async () => {
  const post = vi.fn();

  await handleNativeTrayAction({
    message: createActionRequest('missing-action'),
    post,
    status: createStatus(),
  });

  expect(post).toHaveBeenCalledWith(
    expect.objectContaining({
      accepted: false,
      error: 'Unavailable or stale tray action',
      type: 'extension.tray.actionResult',
    })
  );
});
