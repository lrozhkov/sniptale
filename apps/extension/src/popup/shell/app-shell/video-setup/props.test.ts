import { expect, it, vi } from 'vitest';

import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import type { PopupVideoSetupRuntime } from '../../runtime/types/video-setup';
import { createPopupAppShellRuntime } from '../test-support/runtime';
import { getPopupVideoSetupProps } from './props';

function createRuntime(): PopupVideoSetupRuntime {
  return createPopupAppShellRuntime({
    videoCaptureMode: CaptureMode.VIEWPORT_EMULATION,
    viewportPresets: [{ id: 'preset-1', label: 'Preset', width: 1280, height: 720 }],
  });
}

it('maps runtime state into lazy page props', () => {
  const runtime = createRuntime();
  const props = getPopupVideoSetupProps(runtime);

  expect(props.settings).toBe(runtime.recording.videoSettings);
  expect(props.captureMode).toBe(runtime.recording.videoCaptureMode);
  expect(props.selectedPresetId).toBe(runtime.recording.selectedPresetId);
  expect(props.appliedViewportPresetId).toBe(runtime.recording.appliedViewportPresetId);
  expect(props.appliedViewportTabId).toBe(runtime.recording.appliedViewportTabId);
  expect(props.viewportPresets).toBe(runtime.home.viewportPresets);
  expect(props.activeTabCapabilities).toBe(runtime.environment.activeTabCapabilities);
  expect(props.webcamDevices).toBe(runtime.recording.webcamDevices);
  expect(props.isLoadingWebcams).toBe(false);
  expect(props.onPauseResume).toBe(runtime.recording.handlePauseResume);
  expect(props.onStart).toBe(runtime.recording.handleStartRecording);
  expect(props.onStop).toBe(runtime.recording.handleStop);
  expect(props.recordingState).toBe(runtime.recording.recordingState);

  props.onCancel();
  expect(runtime.recording.handleStop).toHaveBeenCalledWith({ discard: true });
});

it('uses start cancellation while the recorder has not activated yet', () => {
  const runtime = createPopupAppShellRuntime({
    recordingState: {
      captureMode: CaptureMode.TAB,
      captureSource: null,
      countdownEndsAt: Date.now() + 3000,
      duration: 0,
      error: null,
      status: VideoRecordingStatus.COUNTDOWN,
      viewportPreset: null,
    },
  });
  const props = getPopupVideoSetupProps(runtime);

  props.onCancel();

  expect(runtime.recording.handleStop).toHaveBeenCalledWith({ cancelStart: true });
});

it('updates active live media state without changing persisted setup settings', async () => {
  const setRecordingState = vi.fn();
  const setVideoSettings = vi.fn();
  const runtime = createPopupAppShellRuntime({
    recordingState: {
      captureMode: CaptureMode.TAB,
      captureSource: null,
      countdownEndsAt: null,
      duration: 12,
      error: null,
      liveMedia: {
        microphoneDeviceId: 'mic-1',
        microphoneEnabled: true,
        microphoneSelected: true,
        webcamDeviceId: null,
        webcamEnabled: false,
        webcamSettings: null,
        webcamSelected: false,
      },
      status: VideoRecordingStatus.RECORDING,
      viewportPreset: null,
    },
    setRecordingState,
    setVideoSettings,
  });

  const props = getPopupVideoSetupProps(runtime);
  await props.onActiveRecordingSettingsChange({ microphoneEnabled: false });

  expect(runtime.recording.handleUpdateRecordingSettings).toHaveBeenCalledWith({
    microphoneEnabled: false,
  });
  expect(setVideoSettings).not.toHaveBeenCalled();
  expect(setRecordingState).toHaveBeenCalledWith(expect.any(Function));

  const updater = setRecordingState.mock.calls[0]?.[0] as (
    state: typeof runtime.recording.recordingState
  ) => typeof runtime.recording.recordingState;
  expect(updater(runtime.recording.recordingState)).toEqual(
    expect.objectContaining({
      liveMedia: expect.objectContaining({ microphoneEnabled: false, microphoneSelected: true }),
    })
  );
});
