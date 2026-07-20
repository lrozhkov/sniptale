import type { PopupBootstrapResult } from '../../bootstrap';
import type { PopupLifecycleBootstrapParams } from '../types';

export function applyBootstrapSuccess(
  params: PopupLifecycleBootstrapParams,
  state: PopupBootstrapResult
) {
  params.setHomeError(state.homeError ?? null);
  params.setViewportPresets(state.viewportPresets);
  params.setQuickActions(state.quickActions);
  params.setQuickActionsReady(true);
  params.setDisplayMode(state.quickActionsMode);
  params.setVideoSettings(state.videoSettings);
  params.setSelectedPresetId(state.selectedPresetId);
  params.setVideoCaptureMode(state.captureMode);
  params.setRecordingControlCapability(state.recordingControlCapability);
  params.setRecordingState(state.recordingState);
  params.setStartError(state.recordingStatusError ?? null);
  params.setMicrophoneDevices(state.microphones);
  params.setWebcamDevices(state.webcams);
}
