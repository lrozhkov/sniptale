export {
  ensureActiveVideoRecordingLeaseHydrated,
  reconcileVideoRecordingLeaseOnStartup,
} from './video/runtime/recording-completion';
export { recoverVideoCaptureSurfaceOnStartup } from './video/capture-surface/recovery';
export { startRecording } from './video/manager';
export { handleRegionSelectionNavigationStart } from './video/ui/region-selection';
export {
  handleTabRecordingNavigationCommitted,
  handleTabRecordingNavigationCompleted,
  handleTabRecordingNavigationError,
  handleTabRecordingNavigationStart,
  handleTabRecordingWindowBoundsChanged,
  handleTabClose,
} from './video/runtime/manager';
export { resetVideoRecordingRuntimeState } from './video/runtime/session-state';
