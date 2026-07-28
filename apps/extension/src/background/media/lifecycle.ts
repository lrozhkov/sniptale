export {
  ensureActiveVideoRecordingLeaseHydrated,
  reconcileVideoRecordingLeaseOnStartup,
} from './video/recording-control-lease';
export { recoverVideoCaptureSurfaceOnStartup } from './video/capture-surface';
export { startRecording } from './video/manager';
export { handleRegionSelectionNavigationStart } from './video/ui/region-selection';
export {
  handleTabRecordingDebuggerDetach,
  handleTabRecordingNavigationCommitted,
  handleTabRecordingNavigationCompleted,
  handleTabRecordingNavigationError,
  handleTabRecordingNavigationStart,
  handleTabClose,
} from './video/runtime/manager';
export { resetVideoRecordingRuntimeState } from './video/runtime/session-state';
