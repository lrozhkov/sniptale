import type { PopupRuntimeStateSlice } from '../state';
import type { PopupPageAccessRuntime } from '../page-access';
import type { PopupRuntimeActionHandlers } from '../types/action-handlers';
import type { PopupRuntimeRecordingControls } from '../types/recording-controls';
import type {
  PopupRuntimeRecordingState,
  PopupRuntimeState,
  PopupRuntimeViewState,
} from '../types/state';

function assemblePopupRecordingControls(
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

function assemblePopupRecordingState(
  state: PopupRuntimeStateSlice,
  handlers: PopupRuntimeActionHandlers
): PopupRuntimeRecordingState {
  return {
    ...assemblePopupRecordingControls(state),
    handleToggleMicrophone: handlers.handleToggleMicrophone,
    handleToggleWebcam: handlers.handleToggleWebcam,
    handleUpdateRecordingSettings: handlers.handleUpdateRecordingSettings,
    handleStartRecording: handlers.handleStartRecording,
    handlePauseResume: handlers.handlePauseResume,
    handleStop: handlers.handleStop,
  };
}

function assemblePopupViewState(
  state: PopupRuntimeStateSlice,
  pageAccess: PopupPageAccessRuntime
): PopupRuntimeViewState {
  return {
    navigation: {
      isReady: state.session.isReady,
      page: state.session.page,
      showFooter: state.derived.showFooter,
      setPage: state.session.setPage,
    },
    home: {
      quickActions: state.presets.quickActions,
      quickActionsReady: state.presets.quickActionsReady,
      displayMode: state.presets.displayMode,
      viewportPresets: state.presets.viewportPresets,
      homeError: state.session.homeError,
    },
    environment: {
      activeTabCapabilities: state.environment.activeTabCapabilities,
      galleryStatus: state.environment.galleryStatus,
      pageAccess,
    },
  };
}

export function assemblePopupRuntimeState(
  state: PopupRuntimeStateSlice,
  handlers: PopupRuntimeActionHandlers,
  pageAccess: PopupPageAccessRuntime
): PopupRuntimeState {
  return {
    ...assemblePopupViewState(state, pageAccess),
    recording: assemblePopupRecordingState(state, handlers),
  };
}
