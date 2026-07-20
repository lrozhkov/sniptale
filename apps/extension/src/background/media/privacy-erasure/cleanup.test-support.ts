export const recordingLease = {
  captureMode: 'tab',
  controlToken: 'control-token',
  expiresAt: Date.now() + 10_000,
  openEditorAfterRecording: false,
  ownerSenderUrl: 'chrome-extension://test/settings',
  recordingId: 'recording-1',
  recordingTabId: 7,
};

export function createRunningExportLedger() {
  return {
    cancelRequested: false,
    jobId: 'job-1',
    status: 'running',
  };
}
