import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  patchVideoSettingsMock: vi.fn(),
  saveVideoUiStateMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/capture-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/capture-settings')>()),
  patchVideoSettings: mocks.patchVideoSettingsMock,
  saveVideoUiState: mocks.saveVideoUiStateMock,
}));

import {
  CaptureMode,
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { createVideoSettingsPatch, persistVideoSettings, persistVideoUiState } from './index';

function createVideoSettings(
  overrides: Partial<
    Omit<VideoRecordingSettings, 'output' | 'qualityProfileId' | 'qualityProfiles'>
  > = {}
): VideoRecordingSettings {
  return {
    ...DEFAULT_VIDEO_SETTINGS,
    autoFadeDelay: 0,
    countdownSeconds: 3,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: false,
    openEditorAfterRecording: true,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: true,
    ...overrides,
  };
}

describe('popup persistence', () => {
  it('persists only changed video setting fields', async () => {
    const previous = createVideoSettings();
    const settings = createVideoSettings({ diagnosticsEnabled: true });
    const patch = createVideoSettingsPatch(previous, settings);

    await persistVideoSettings(patch);

    expect(patch).toEqual({ diagnosticsEnabled: true });
    expect(mocks.patchVideoSettingsMock).toHaveBeenCalledWith(patch);
  });

  it('stores current size independently from tab capture mode', async () => {
    await persistVideoUiState(CaptureMode.TAB, null);

    expect(mocks.saveVideoUiStateMock).toHaveBeenCalledWith({
      captureMode: CaptureMode.TAB,
      viewportPresetId: null,
    });
  });

  it('preserves screen mode while storing the inert preset preference', async () => {
    await persistVideoUiState(CaptureMode.SCREEN, 'preset-1');

    expect(mocks.saveVideoUiStateMock).toHaveBeenLastCalledWith({
      captureMode: CaptureMode.SCREEN,
      viewportPresetId: 'preset-1',
    });
  });

  it('stores viewport preset selection independently from capture mode', async () => {
    await persistVideoUiState(CaptureMode.TAB, 'preset-1');

    expect(mocks.saveVideoUiStateMock).toHaveBeenLastCalledWith({
      captureMode: CaptureMode.TAB,
      viewportPresetId: 'preset-1',
    });
  });
});
