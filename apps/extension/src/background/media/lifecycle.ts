export { reconcileVideoRecordingLeaseOnStartup } from './video/recording-control-lease';
export { startRecording } from './video/manager';
export { handleRegionSelectionNavigationStart } from './video/ui/region-selection';
export {
  handleControlledCursorNavigationStart,
  handleTabClose,
  handleTabUpdated,
  handleViewportRecordingDebuggerDetach,
  handleViewportRecordingNavigationStart,
} from './video/runtime/manager';
export { resetVideoRecordingRuntimeState } from './video/runtime/session-state';
