export const recordingLease = {
  captureMode: 'tab',
  controlToken: 'control-token',
  expiresAt: Date.now() + 10_000,
  ownerSenderUrl: 'chrome-extension://test/settings',
  recordingId: 'recording-1',
  recordingTabId: 7,
  surfaceBinding: null,
  viewportPresetId: null,
};

export function createRunningExportLedger() {
  return {
    cancelRequested: false,
    jobId: 'job-1',
    status: 'running',
  };
}
