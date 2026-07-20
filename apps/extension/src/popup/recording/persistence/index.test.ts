import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  saveVideoSettingsMock: vi.fn(),
  saveVideoUiStateMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/capture-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/capture-settings')>()),
  saveVideoSettings: mocks.saveVideoSettingsMock,
  saveVideoUiState: mocks.saveVideoUiStateMock,
}));

import {
  CaptureMode,
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { persistVideoSettings, persistVideoUiState } from './index';

function createVideoSettings(
  overrides: Partial<VideoRecordingSettings> = {}
): VideoRecordingSettings {
  return {
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
  it('persists video settings directly', async () => {
    const settings = createVideoSettings({ diagnosticsEnabled: true });

    await persistVideoSettings(settings);

    expect(mocks.saveVideoSettingsMock).toHaveBeenCalledWith(settings);
  });

  it('stores viewport emulation without preset as tab mode', async () => {
    await persistVideoUiState(CaptureMode.VIEWPORT_EMULATION, null);

    expect(mocks.saveVideoUiStateMock).toHaveBeenCalledWith({
      captureMode: CaptureMode.TAB,
      viewportPresetId: null,
    });
  });

  it('preserves non-legacy capture modes while storing viewport preset preference', async () => {
    await persistVideoUiState(CaptureMode.SCREEN, 'preset-1');

    expect(mocks.saveVideoUiStateMock).toHaveBeenLastCalledWith({
      captureMode: CaptureMode.SCREEN,
      viewportPresetId: 'preset-1',
    });
  });

  it('stores viewport preset selection independently from legacy viewport mode', async () => {
    await persistVideoUiState(CaptureMode.VIEWPORT_EMULATION, 'preset-1');

    expect(mocks.saveVideoUiStateMock).toHaveBeenLastCalledWith({
      captureMode: CaptureMode.TAB,
      viewportPresetId: 'preset-1',
    });
  });
});
