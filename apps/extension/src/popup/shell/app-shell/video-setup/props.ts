import type { PopupVideoSetupRuntime } from '../../runtime/types/video-setup';
import {
  updateVideoRecordingLiveMediaState,
  VideoRecordingStatus,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { createPopupVideoSetupHandlers } from './handlers';

export function getPopupVideoSetupProps(runtime: PopupVideoSetupRuntime) {
  const handlers = createPopupVideoSetupHandlers(runtime);
  const onActiveRecordingSettingsChange = createActiveRecordingSettingsChangeHandler(runtime);

  return {
    ...createVideoSetupStateProps(runtime),
    ...handlers,
    ...createVideoSetupActionProps(runtime, onActiveRecordingSettingsChange),
  };
}

function createVideoSetupStateProps(runtime: PopupVideoSetupRuntime) {
  const { recording } = runtime;

  return {
    settings: recording.videoSettings,
    captureMode: recording.videoCaptureMode,
    selectedPresetId: recording.selectedPresetId,
    appliedViewportPresetId: recording.appliedViewportPresetId,
    appliedViewportTabId: recording.appliedViewportTabId,
    viewportPresets: runtime.home.viewportPresets,
    activeTabCapabilities: runtime.environment.activeTabCapabilities,
    microphoneDevices: recording.microphoneDevices,
    isLoadingMicrophones: recording.isLoadingMicrophones,
    webcamDevices: recording.webcamDevices,
    isLoadingWebcams: recording.isLoadingWebcams,
    startError: recording.startError,
    isStartPending: recording.isStartPending,
    pageAccessDisabledReason: runtime.environment.pageAccess?.disabledReason ?? null,
    activeRecordingId: recording.recordingControlCapability?.recordingId ?? null,
    recordingState: recording.recordingState,
    galleryStatus: runtime.environment.galleryStatus,
  };
}

function createVideoSetupActionProps(
  runtime: PopupVideoSetupRuntime,
  onActiveRecordingSettingsChange: (patch: Partial<VideoRecordingSettings>) => Promise<void>
) {
  const { handlePauseResume, handleStartRecording, handleStop, recordingState } = runtime.recording;

  return {
    onStart: handleStartRecording,
    onPauseResume: handlePauseResume,
    onStop: handleStop,
    onCancel: () =>
      void handleStop(
        isRecordingStartInProgress(recordingState.status)
          ? { cancelStart: true }
          : { discard: true }
      ),
    onActiveRecordingSettingsChange,
  };
}

function isRecordingStartInProgress(status: VideoRecordingStatus): boolean {
  return status === VideoRecordingStatus.COUNTDOWN || status === VideoRecordingStatus.PREPARING;
}

function createActiveRecordingSettingsChangeHandler(runtime: PopupVideoSetupRuntime) {
  return async (patch: Partial<VideoRecordingSettings>) => {
    await runtime.recording.handleUpdateRecordingSettings(patch);
    runtime.recording.setRecordingState((previous) => ({
      ...previous,
      liveMedia: updateVideoRecordingLiveMediaState(previous.liveMedia, patch),
    }));
  };
}
