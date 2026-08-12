import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CaptureMode,
  VideoOutputCodec,
  VideoOutputContainer,
  VideoFrameRate,
  VideoQuality,
  VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

const { browserStorageLocalGetMock, browserStorageLocalSetMock } = vi.hoisted(() => ({
  browserStorageLocalGetMock: vi.fn(),
  browserStorageLocalSetMock: vi.fn(),
}));

vi.mock('../infrastructure/browser-storage', (_importOriginal) => ({
  browserStorage: {
    local: {
      get: browserStorageLocalGetMock,
      set: browserStorageLocalSetMock,
    },
  },
}));

import {
  loadVideoSettings,
  loadVideoUiState,
  mutateVideoSettings,
  patchVideoSettings,
  saveVideoUiState,
} from './index';

function resetVideoStorageMocks() {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  browserStorageLocalGetMock.mockResolvedValue({});
  browserStorageLocalSetMock.mockResolvedValue(undefined);
}

async function verifyVideoSettingsContracts() {
  browserStorageLocalGetMock.mockResolvedValueOnce({});
  await patchVideoSettings({ diagnosticsEnabled: true });

  expect(browserStorageLocalSetMock).toHaveBeenCalledWith(
    {
      sniptale_video_settings: {
        ...DEFAULT_VIDEO_SETTINGS,
        diagnosticsEnabled: true,
      },
    },
    expect.any(Object)
  );

  browserStorageLocalGetMock
    .mockResolvedValueOnce({
      sniptale_video_settings: {
        microphoneEnabled: true,
        webcamEnabled: true,
        webcamDeviceId: 'cam-2',
        systemAudioEnabled: false,
        outputProfile: {
          ...DEFAULT_VIDEO_SETTINGS.outputProfile,
          quality: VideoQuality.MEDIUM,
        },
        qualityProfileId: DEFAULT_VIDEO_SETTINGS.qualityProfileId,
        qualityProfiles: DEFAULT_VIDEO_SETTINGS.qualityProfiles,
        countdownSeconds: 'bad',
        autoFadeDelay: 8,
        diagnosticsEnabled: true,
      },
    })
    .mockResolvedValueOnce({
      sniptale_video_settings: 'corrupted',
    });

  await expect(loadVideoSettings()).resolves.toEqual({
    ...DEFAULT_VIDEO_SETTINGS,
    microphoneEnabled: true,
    webcamEnabled: true,
    webcamDeviceId: 'cam-2',
    systemAudioEnabled: false,
    outputProfile: {
      ...DEFAULT_VIDEO_SETTINGS.outputProfile,
      quality: VideoQuality.MEDIUM,
    },
    diagnosticsEnabled: true,
  });

  await expect(loadVideoSettings()).resolves.toEqual(DEFAULT_VIDEO_SETTINGS);
}

async function verifyVideoUiStateContracts() {
  const state = {
    captureMode: CaptureMode.SCREEN,
    viewportPresetId: 'preset-1',
  };

  await saveVideoUiState(state);

  expect(browserStorageLocalSetMock).toHaveBeenCalledWith({
    sniptale_video_ui_state: state,
  });

  browserStorageLocalGetMock
    .mockResolvedValueOnce({
      sniptale_video_ui_state: {
        captureMode: CaptureMode.TAB,
        viewportPresetId: 42,
      },
    })
    .mockResolvedValueOnce({
      sniptale_video_ui_state: null,
    });

  await expect(loadVideoUiState()).resolves.toEqual({
    captureMode: CaptureMode.TAB,
    viewportPresetId: null,
  });

  await expect(loadVideoUiState()).resolves.toEqual({
    captureMode: CaptureMode.TAB,
    viewportPresetId: null,
  });
}

describe('video', () => {
  beforeEach(resetVideoStorageMocks);

  it(
    'patches video settings and drops invalid persisted fields on load',
    verifyVideoSettingsContracts
  );
  it(
    'saves video UI state and falls back when persisted payload is invalid',
    verifyVideoUiStateContracts
  );

  it('loads output and custom-profile choices without repairing storage on read', async () => {
    const outputProfile = {
      codec: VideoOutputCodec.AVC,
      container: VideoOutputContainer.MP4,
      frameRate: VideoFrameRate.FPS30,
      quality: VideoQuality.MEDIUM,
      resolution: VideoResolutionPreset.P720,
    };
    const qualityProfiles = [
      {
        id: 'custom:review',
        name: 'Review',
        configuration: outputProfile,
      },
    ];
    browserStorageLocalGetMock.mockResolvedValue({
      sniptale_video_settings: {
        outputProfile,
        qualityProfileId: 'custom:review',
        qualityProfiles,
      },
    });

    await expect(loadVideoSettings()).resolves.toEqual({
      ...DEFAULT_VIDEO_SETTINGS,
      outputProfile,
      qualityProfileId: 'custom:review',
      qualityProfiles,
    });
    expect(browserStorageLocalSetMock).not.toHaveBeenCalled();
  });

  it('round-trips the last selected recording controls through canonical storage', async () => {
    let stored = DEFAULT_VIDEO_SETTINGS;
    browserStorageLocalGetMock.mockImplementation(async () => ({
      sniptale_video_settings: stored,
    }));
    browserStorageLocalSetMock.mockImplementation(async (items) => {
      stored = items.sniptale_video_settings as typeof DEFAULT_VIDEO_SETTINGS;
    });
    const outputProfile = {
      codec: VideoOutputCodec.AVC,
      container: VideoOutputContainer.MP4,
      frameRate: VideoFrameRate.FPS30,
      quality: VideoQuality.HIGH,
      resolution: VideoResolutionPreset.P1080,
    };

    await patchVideoSettings({
      countdownSeconds: 8,
      microphoneDeviceId: 'mic-last',
      microphoneEnabled: true,
      outputProfile,
      qualityProfileId: null,
      systemAudioEnabled: false,
      webcamDeviceId: 'cam-last',
      webcamEnabled: true,
    });

    await expect(loadVideoSettings()).resolves.toEqual({
      ...DEFAULT_VIDEO_SETTINGS,
      countdownSeconds: 8,
      microphoneDeviceId: 'mic-last',
      microphoneEnabled: true,
      outputProfile,
      qualityProfileId: null,
      systemAudioEnabled: false,
      webcamDeviceId: 'cam-last',
      webcamEnabled: true,
    });
  });

  it('resets the previous quality schema without migrating or repairing storage', async () => {
    browserStorageLocalGetMock.mockResolvedValue({
      sniptale_video_settings: {
        microphoneEnabled: true,
        quality: VideoQuality.LOW,
        systemAudioEnabled: false,
      },
    });

    await expect(loadVideoSettings()).resolves.toEqual(DEFAULT_VIDEO_SETTINGS);
    expect(browserStorageLocalSetMock).not.toHaveBeenCalled();
  });

  it('serializes concurrent field and profile mutations without stale overwrites', async () => {
    let stored = DEFAULT_VIDEO_SETTINGS;
    browserStorageLocalGetMock.mockImplementation(async () => ({
      sniptale_video_settings: stored,
    }));
    browserStorageLocalSetMock.mockImplementation(async (items) => {
      stored = items.sniptale_video_settings as typeof DEFAULT_VIDEO_SETTINGS;
    });
    const profile = {
      id: 'custom:concurrent',
      name: 'Concurrent',
      configuration: {
        ...DEFAULT_VIDEO_SETTINGS.outputProfile,
        quality: VideoQuality.MEDIUM,
      },
    };

    await Promise.all([
      patchVideoSettings({ diagnosticsEnabled: true }),
      mutateVideoSettings((current) => ({
        ...current,
        qualityProfiles: [...current.qualityProfiles, profile],
      })),
    ]);

    expect(stored.diagnosticsEnabled).toBe(true);
    expect(stored.qualityProfiles).toEqual([profile]);
  });
});
