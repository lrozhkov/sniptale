import type { PopupRuntimeStateSlice } from '../state';
import type { PopupRuntimeRecordingControls } from '../types/recording-controls';

export function assemblePopupRecordingControls(
  state: PopupRuntimeStateSlice
): PopupRuntimeRecordingControls {
  return {
    videoCaptureMode: state.presets.videoCaptureMode,
    selectedPresetId: state.presets.selectedPresetId,
    selectedPreset: state.presets.selectedPreset,
    appliedViewportPresetId: state.presets.appliedViewportPresetId,
    appliedViewportTabId: state.presets.appliedViewportTabId,
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
    setAppliedViewportPresetId: state.presets.setAppliedViewportPresetId,
    setAppliedViewportTabId: state.presets.setAppliedViewportTabId,
    setStartError: state.recording.setStartError,
    setVideoSettings: state.recording.setVideoSettings,
    setRecordingState: state.recording.setRecordingState,
    clearStartError: state.recording.clearStartError,
  };
}
