import { usePopupLifecycleEffect } from '../lifecycle/effect';
import type { PopupRuntimeStateSlice } from './state';
import { invalidateViewportPresetApplyGeneration } from './viewport-apply-generation';

export function usePopupLifecycleSync(state: PopupRuntimeStateSlice) {
  usePopupLifecycleEffect(() => ({
    clearAppliedViewportAuthority: () => {
      invalidateViewportPresetApplyGeneration();
      state.presets.setAppliedViewportPresetId(null);
      state.presets.setAppliedViewportTabId(null);
    },
    refreshActiveTabCapabilities: state.actions.refreshActiveTabCapabilities,
    refreshGalleryStatus: state.actions.refreshGalleryStatus,
    setHomeError: state.session.setHomeError,
    setViewportPresets: state.presets.setViewportPresets,
    setQuickActions: state.presets.setQuickActions,
    setQuickActionsReady: state.presets.setQuickActionsReady,
    setDisplayMode: state.presets.setDisplayMode,
    setVideoSettings: state.recording.setVideoSettings,
    setSelectedPresetId: state.presets.setSelectedPresetId,
    setVideoCaptureMode: state.presets.setVideoCaptureMode,
    setRecordingControlCapability: state.recording.setRecordingControlCapability,
    setRecordingState: state.recording.setRecordingState,
    setMicrophoneDevices: state.devices.setMicrophoneDevices,
    setWebcamDevices: state.devices.setWebcamDevices,
    setGalleryStatus: state.environment.setGalleryStatus,
    setIsReady: state.session.setIsReady,
    setStartError: state.recording.setStartError,
    setIsStartPending: state.recording.setIsStartPending,
  }));
}
