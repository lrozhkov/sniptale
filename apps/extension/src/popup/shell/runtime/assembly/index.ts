import type { PopupVideoRuntimeStateSlice } from '../types/internal-state';
import type { PopupPageAccessRuntime } from '../page-access';
import type { PopupRuntimeActionHandlers } from '../types/action-handlers';
import type { PopupVideoSetupRuntime } from '../types/video-setup';

export function assemblePopupVideoRuntimeState(
  state: PopupVideoRuntimeStateSlice,
  handlers: PopupRuntimeActionHandlers,
  pageAccess: PopupPageAccessRuntime
): PopupVideoSetupRuntime {
  return {
    environment: {
      activeTabCapabilities: state.environment.activeTabCapabilities,
      galleryStatus: state.environment.galleryStatus,
      pageAccess,
    },
    recording: {
      videoCaptureMode: state.presets.videoCaptureMode,
      selectedPresetId: state.presets.selectedPresetId,
      selectedPreset: state.presets.selectedPreset,
      recordingControlCapability: state.recording.recordingControlCapability,
      videoSettings: state.recording.videoSettings,
      recordingState: state.recording.recordingState,
      startError: state.recording.startError,
      isStartPending: state.recording.isStartPending,
      recordingActive: state.recording.recordingActive,
      microphoneDevices: state.devices.microphoneDevices,
      isLoadingMicrophones: state.devices.isLoadingMicrophones,
      webcamDevices: state.devices.webcamDevices,
      isLoadingWebcams: state.devices.isLoadingWebcams,
      setVideoCaptureMode: state.presets.setVideoCaptureMode,
      setSelectedPresetId: state.presets.setSelectedPresetId,
      setStartError: state.recording.setStartError,
      setVideoSettings: state.recording.setVideoSettings,
      setRecordingState: state.recording.setRecordingState,
      clearStartError: state.recording.clearStartError,
      ...handlers,
    },
    viewportPresets: state.presets.viewportPresets,
  };
}
