import { expect, it, vi } from 'vitest';

import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import type { PopupVideoSetupRuntime } from '../../runtime/types/video-setup';
import { createPopupVideoSetupRuntime } from '../test-support/runtime';
import { getPopupVideoSetupProps } from './props';
import { createTranslator } from '../../../../platform/i18n/popup';

function createRuntime(): PopupVideoSetupRuntime {
  return createPopupVideoSetupRuntime({
    videoCaptureMode: CaptureMode.TAB,
    viewportPresets: [
      {
        kind: 'user',
        id: 'preset-1',
        name: 'Preset',
        target: 'window',
        width: 1280,
        height: 720,
        enabled: true,
        order: 0,
      },
    ],
  });
}

it('maps runtime state into lazy page props', () => {
  const runtime = createRuntime();
  const props = getPopupVideoSetupProps(runtime);

  expect(props.settings).toBe(runtime.recording.videoSettings);
  expect(props.captureMode).toBe(runtime.recording.videoCaptureMode);
  expect(props.selectedPresetId).toBe(runtime.recording.selectedPresetId);
  expect(props.viewportPresets).toBe(runtime.viewportPresets);
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

it('clears only the recovered device permission error while refreshing the existing inventory', async () => {
  const setStartError = vi.fn();
  const runtime = createRuntime();
  runtime.recording.setStartError = setStartError;
  const refreshMicrophones = vi.fn().mockResolvedValue([]);
  const refreshWebcams = vi.fn().mockResolvedValue([]);
  runtime.actions = { refreshMicrophones, refreshWebcams };
  const props = getPopupVideoSetupProps(runtime);
  await props.onRefreshMicrophones?.();
  expect(refreshMicrophones).toHaveBeenCalledOnce();
  expect(setStartError).toHaveBeenCalledOnce();
  const update = setStartError.mock.calls[0]?.[0] as (error: string | null) => string | null;
  expect(update(createTranslator('en')('popup.video.microphonePermissionDenied'))).toBeNull();
  expect(update(createTranslator('ru')('popup.video.microphonePermissionRequired'))).toBeNull();
  const cameraError = createTranslator('en')('popup.video.cameraPermissionDenied');
  expect(update(cameraError)).toBe(cameraError);
  expect(update('Unrelated recording failure')).toBe('Unrelated recording failure');
  expect(update(null)).toBeNull();
  expect(runtime.recording.handleStartRecording).not.toHaveBeenCalled();
});

it('clears recovered camera permission errors without clearing microphone errors', async () => {
  const setStartError = vi.fn();
  const runtime = createRuntime();
  runtime.recording.setStartError = setStartError;
  runtime.actions = {
    refreshMicrophones: vi.fn().mockResolvedValue([]),
    refreshWebcams: vi.fn().mockResolvedValue([]),
  };
  await getPopupVideoSetupProps(runtime).onRefreshWebcams?.();
  const update = setStartError.mock.calls[0]?.[0] as (error: string | null) => string | null;
  expect(update(createTranslator('ru')('popup.video.cameraPermissionDenied'))).toBeNull();
  const microphoneError = createTranslator('en')('popup.video.microphonePermissionDenied');
  expect(update(microphoneError)).toBe(microphoneError);
  expect(runtime.actions.refreshWebcams).toHaveBeenCalledOnce();
});

it('uses start cancellation while the recorder has not activated yet', () => {
  const runtime = createPopupVideoSetupRuntime({
    recordingState: {
      captureMode: CaptureMode.TAB,
      captureSource: null,
      countdownEndsAt: Date.now() + 3000,
      duration: 0,
      error: null,
      status: VideoRecordingStatus.COUNTDOWN,
      viewportPresetId: null,
    },
  });
  const props = getPopupVideoSetupProps(runtime);

  props.onCancel();

  expect(runtime.recording.handleStop).toHaveBeenCalledWith({ cancelStart: true });
});

it('updates active live media state without changing persisted setup settings', async () => {
  const setRecordingState = vi.fn();
  const setVideoSettings = vi.fn();
  const runtime = createPopupVideoSetupRuntime({
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
      viewportPresetId: null,
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
