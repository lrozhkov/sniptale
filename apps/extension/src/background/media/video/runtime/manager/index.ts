export {
  finalizeRecordingDiagnostics,
  getCurrentRecordingId,
  getRecordingTabId,
  handleTabClose,
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
  handleTabRecordingDebuggerDetach,
  handleTabRecordingNavigationCommitted,
  handleTabRecordingNavigationCompleted,
  handleTabRecordingNavigationError,
  handleTabRecordingNavigationStart,
} from './tab-navigation';
