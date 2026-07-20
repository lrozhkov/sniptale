export {
  finalizeRecordingDiagnostics,
  getCurrentRecordingId,
  getRecordingTabId,
  handleTabClose,
  handleTabUpdated,
  isRecording,
  resetRecordingId,
  resetRecordingTabId,
} from './runtime';
export {
  notifyRecordingStartFailed,
  pauseRecording,
  resumeRecording,
  stopRecording,
  stopRecordingForPrivacyErasure,
} from './controls';
export {
  handleViewportRecordingDebuggerDetach,
  handleViewportRecordingNavigationStart,
} from './viewport-navigation';
export { handleControlledCursorNavigationStart } from './controlled-cursor/navigation';
