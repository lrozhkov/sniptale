import { usePopupLifecycleEffect } from '../lifecycle/effect';
import type { PopupRuntimeStateSlice } from './state';

export function usePopupLifecycleSync(state: PopupRuntimeStateSlice) {
  usePopupLifecycleEffect(() => ({
    bootstrap: {
      refreshActiveTabCapabilities: state.actions.refreshActiveTabCapabilities,
      refreshGalleryStatus: state.actions.refreshGalleryStatus,
      setHomeError: state.session.setHomeError,
      navigateToPage: state.session.navigateToPage,
      setViewportPresets: state.presets.setViewportPresets,
      setQuickActions: state.presets.setQuickActions,
      setQuickActionsReady: state.presets.setQuickActionsReady,
      setVideoSettings: state.recording.setVideoSettings,
      setSelectedPresetId: state.presets.setSelectedPresetId,
      setVideoCaptureMode: state.presets.setVideoCaptureMode,
      setScreenshotStartupMode: state.presets.setScreenshotStartupMode,
      setInitialScreenshotSetupState: state.presets.setInitialScreenshotSetupState,
      setRecordingControlCapability: state.recording.setRecordingControlCapability,
      setRecordingState: state.recording.setRecordingState,
      setIsReady: state.session.setIsReady,
      setStartError: state.recording.setStartError,
    },
    browser: {
      refreshActiveTabCapabilities: state.actions.refreshActiveTabCapabilities,
      refreshGalleryStatus: state.actions.refreshGalleryStatus,
    },
    mediaHub: {
      refreshGalleryStatus: state.actions.refreshGalleryStatus,
      setGalleryStatus: state.environment.setGalleryStatus,
    },
    recording: {
      setRecordingState: state.recording.setRecordingState,
      setStartError: state.recording.setStartError,
      setIsStartPending: state.recording.setIsStartPending,
    },
  }));
}
