import type { PopupVideoSetupRuntime } from '../../runtime/types/video-setup';
import {
  updateVideoRecordingLiveMediaState,
  VideoRecordingStatus,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { createPopupVideoSetupHandlers } from './handlers';
import {
  createTranslator,
  SUPPORTED_LOCALES,
  type TranslationKey,
} from '../../../../platform/i18n/popup';

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
    viewportPresets: runtime.viewportPresets,
    activeTabCapabilities: runtime.environment.activeTabCapabilities,
    microphoneDevices: recording.microphoneDevices,
    isLoadingMicrophones: recording.isLoadingMicrophones,
    onRefreshMicrophones: createMediaAccessRecovery(
      runtime,
      'microphone',
      runtime.actions?.refreshMicrophones
    ),
    webcamDevices: recording.webcamDevices,
    isLoadingWebcams: recording.isLoadingWebcams,
    onRefreshWebcams: createMediaAccessRecovery(runtime, 'camera', runtime.actions?.refreshWebcams),
    startError: recording.startError,
    isStartPending: recording.isStartPending,
    pageAccessDisabledReason: runtime.environment.pageAccess?.disabledReason ?? null,
    activeRecordingId: recording.recordingControlCapability?.recordingId ?? null,
    recordingState: recording.recordingState,
    galleryStatus: runtime.environment.galleryStatus,
  };
}

function createMediaAccessRecovery(
  runtime: PopupVideoSetupRuntime,
  permissionName: 'microphone' | 'camera',
  refresh: (() => Promise<unknown>) | undefined
) {
  if (!refresh) return undefined;
  const recoveredKeys: TranslationKey[] =
    permissionName === 'microphone'
      ? ['popup.video.microphonePermissionRequired', 'popup.video.microphonePermissionDenied']
      : ['popup.video.cameraPermissionRequired', 'popup.video.cameraPermissionDenied'];
  const recoveredMessages = new Set(
    SUPPORTED_LOCALES.flatMap((locale) => {
      const translator = createTranslator(locale);
      return recoveredKeys.map((key) => translator(key));
    })
  );
  return async () => {
    runtime.recording.setStartError((current) =>
      current && recoveredMessages.has(current) ? null : current
    );
    return refresh();
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
    onRefreshRecordingState: runtime.recording.handleRefreshRecordingState,
    onCancel: () =>
      handleStop(
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
