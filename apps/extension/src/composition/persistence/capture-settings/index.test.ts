import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureMode, VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
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

import { loadVideoSettings, loadVideoUiState, saveVideoSettings, saveVideoUiState } from './index';

function resetVideoStorageMocks() {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  browserStorageLocalGetMock.mockResolvedValue({});
  browserStorageLocalSetMock.mockResolvedValue(undefined);
}

async function verifyVideoSettingsContracts() {
  await saveVideoSettings(DEFAULT_VIDEO_SETTINGS);

  expect(browserStorageLocalSetMock).toHaveBeenCalledWith({
    sniptale_video_settings: DEFAULT_VIDEO_SETTINGS,
  });

  browserStorageLocalGetMock
    .mockResolvedValueOnce({
      sniptale_video_settings: {
        microphoneEnabled: true,
        webcamEnabled: true,
        webcamDeviceId: 'cam-2',
        systemAudioEnabled: false,
        quality: VideoQuality.MEDIUM,
        countdownSeconds: 'bad',
        autoFadeDelay: 8,
        openEditorAfterRecording: true,
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
    quality: VideoQuality.MEDIUM,
    autoFadeDelay: 8,
    openEditorAfterRecording: true,
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
        captureMode: CaptureMode.VIEWPORT_EMULATION,
        viewportPresetId: 42,
      },
    })
    .mockResolvedValueOnce({
      sniptale_video_ui_state: null,
    });

  await expect(loadVideoUiState()).resolves.toEqual({
    captureMode: CaptureMode.VIEWPORT_EMULATION,
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
    'saves video settings and drops invalid persisted fields on load',
    verifyVideoSettingsContracts
  );
  it(
    'saves video UI state and falls back when persisted payload is invalid',
    verifyVideoUiStateContracts
  );
});
