import { expect, it, vi } from 'vitest';

import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  CaptureMode,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import type { PopupVideoSetupRuntime } from '../../runtime/types/video-setup';
import {
  createPopupAppShellRuntime,
  type PopupRuntimeStateOverrides,
} from '../test-support/runtime';
import { createPopupVideoSetupHandlers } from './handlers';

function createRuntime(overrides: PopupRuntimeStateOverrides = {}): PopupVideoSetupRuntime {
  return createPopupAppShellRuntime({
    galleryStatus: null,
    selectedPresetId: null,
    ...overrides,
  });
}

it('updates only the recording draft when an existing preset is selected', () => {
  const runtime = createRuntime();
  const handlers = createPopupVideoSetupHandlers(runtime);

  handlers.onPresetChange('preset-1');

  expect(runtime.recording.clearStartError).toHaveBeenCalledOnce();
  expect(runtime.recording.setSelectedPresetId).toHaveBeenCalledWith('preset-1');
  expect(runtime.recording.setVideoSettings).not.toHaveBeenCalled();
});

it('normalizes missing presets to current size', () => {
  const runtime = createRuntime();

  createPopupVideoSetupHandlers(runtime).onPresetChange('missing');

  expect(runtime.recording.setSelectedPresetId).toHaveBeenCalledWith(null);
});

it('patches media settings and toggles media devices through the runtime', () => {
  const runtime = createRuntime();
  const handlers = createPopupVideoSetupHandlers(runtime);
  const patch: Partial<VideoRecordingSettings> = { microphoneDeviceId: 'mic-2' };

  handlers.onMicrophoneDeviceChange('mic-2');
  handlers.onWebcamDeviceChange('cam-2');
  handlers.onSettingsChange(patch);
  handlers.onToggleMicrophone();
  handlers.onToggleWebcam();

  expect(runtime.recording.setVideoSettings).toHaveBeenCalledTimes(3);
  expect(runtime.recording.handleToggleMicrophone).toHaveBeenCalledOnce();
  expect(runtime.recording.handleToggleWebcam).toHaveBeenCalledOnce();
});

it('preserves controlled cursor settings while changing capture modes', () => {
  const runtime = createRuntime({ videoCaptureMode: CaptureMode.SCREEN });
  const handlers = createPopupVideoSetupHandlers(runtime);

  handlers.onCaptureModeChange(CaptureMode.SCREEN);
  handlers.onSettingsChange({ controlledCursorCaptureEnabled: true });

  const applyPatch = vi.mocked(runtime.recording.setVideoSettings).mock.calls[0]?.[0] as (
    settings: VideoRecordingSettings
  ) => VideoRecordingSettings;
  expect(applyPatch(DEFAULT_VIDEO_SETTINGS)).toEqual(
    expect.objectContaining({ controlledCursorCaptureEnabled: true })
  );
});

it('forces camera-compatible recording settings', () => {
  const runtime = createRuntime({
    videoSettings: {
      ...DEFAULT_VIDEO_SETTINGS,
      controlledCursorCaptureEnabled: true,
      diagnosticsEnabled: true,
      systemAudioEnabled: true,
      webcamDeviceId: null,
      webcamEnabled: false,
    },
    webcamDevices: [{ deviceId: 'cam-2', label: 'Camera 2' }],
  });

  createPopupVideoSetupHandlers(runtime).onCaptureModeChange(CaptureMode.CAMERA);

  expect(runtime.recording.setVideoCaptureMode).toHaveBeenCalledWith(CaptureMode.CAMERA);
  const applyPatch = vi.mocked(runtime.recording.setVideoSettings).mock.calls[0]?.[0] as (
    settings: VideoRecordingSettings
  ) => VideoRecordingSettings;
  expect(applyPatch(runtime.recording.videoSettings)).toEqual(
    expect.objectContaining({
      controlledCursorCaptureEnabled: false,
      diagnosticsEnabled: false,
      sourceCount: 1,
      systemAudioEnabled: false,
      webcamDeviceId: 'cam-2',
      webcamEnabled: true,
    })
  );
});
