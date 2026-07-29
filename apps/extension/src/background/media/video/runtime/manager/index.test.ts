import { expect, it, vi } from 'vitest';

const {
  finalizeRecordingDiagnosticsFromOwner,
  getCurrentRecordingIdFromOwner,
  getRecordingTabIdFromOwner,
  handleTabCloseFromOwner,
  isRecordingFromOwner,
  resetRecordingIdFromOwner,
  resetRecordingTabIdFromOwner,
  notifyRecordingStartFailedFromOwner,
  pauseRecordingFromOwner,
  resumeRecordingFromOwner,
  stopRecordingFromOwner,
  handleTabRecordingDebuggerDetachFromOwner,
  handleTabRecordingNavigationCommittedFromOwner,
  handleTabRecordingNavigationCompletedFromOwner,
  handleTabRecordingNavigationErrorFromOwner,
  handleTabRecordingNavigationStartFromOwner,
} = vi.hoisted(() => ({
  finalizeRecordingDiagnosticsFromOwner: vi.fn(),
  getCurrentRecordingIdFromOwner: vi.fn(),
  getRecordingTabIdFromOwner: vi.fn(),
  handleTabCloseFromOwner: vi.fn(),
  isRecordingFromOwner: vi.fn(),
  resetRecordingIdFromOwner: vi.fn(),
  resetRecordingTabIdFromOwner: vi.fn(),
  notifyRecordingStartFailedFromOwner: vi.fn(),
  pauseRecordingFromOwner: vi.fn(),
  resumeRecordingFromOwner: vi.fn(),
  stopRecordingFromOwner: vi.fn(),
  handleTabRecordingDebuggerDetachFromOwner: vi.fn(),
  handleTabRecordingNavigationCommittedFromOwner: vi.fn(),
  handleTabRecordingNavigationCompletedFromOwner: vi.fn(),
  handleTabRecordingNavigationErrorFromOwner: vi.fn(),
  handleTabRecordingNavigationStartFromOwner: vi.fn(),
}));

vi.mock('./runtime', () => ({
  finalizeRecordingDiagnostics: finalizeRecordingDiagnosticsFromOwner,
  getCurrentRecordingId: getCurrentRecordingIdFromOwner,
  getRecordingTabId: getRecordingTabIdFromOwner,
  handleTabClose: handleTabCloseFromOwner,
  isRecording: isRecordingFromOwner,
  resetRecordingId: resetRecordingIdFromOwner,
  resetRecordingTabId: resetRecordingTabIdFromOwner,
}));

vi.mock('./controls', () => ({
  notifyRecordingStartFailed: notifyRecordingStartFailedFromOwner,
  pauseRecording: pauseRecordingFromOwner,
  resumeRecording: resumeRecordingFromOwner,
  stopRecording: stopRecordingFromOwner,
}));

vi.mock('./tab-navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tab-navigation')>()),
  handleTabRecordingDebuggerDetach: handleTabRecordingDebuggerDetachFromOwner,
  handleTabRecordingNavigationCommitted: handleTabRecordingNavigationCommittedFromOwner,
  handleTabRecordingNavigationCompleted: handleTabRecordingNavigationCompletedFromOwner,
  handleTabRecordingNavigationError: handleTabRecordingNavigationErrorFromOwner,
  handleTabRecordingNavigationStart: handleTabRecordingNavigationStartFromOwner,
}));

import {
  finalizeRecordingDiagnostics,
  getCurrentRecordingId,
  getRecordingTabId,
  handleTabClose,
  handleTabRecordingDebuggerDetach,
  handleTabRecordingNavigationCommitted,
  handleTabRecordingNavigationCompleted,
  handleTabRecordingNavigationError,
  handleTabRecordingNavigationStart,
  isRecording,
  notifyRecordingStartFailed,
  pauseRecording,
  resetRecordingId,
  resetRecordingTabId,
  resumeRecording,
  stopRecording,
} from './index';

it('re-exports the runtime facade without wrapping', () => {
  expect(finalizeRecordingDiagnostics).toBe(finalizeRecordingDiagnosticsFromOwner);
  expect(getCurrentRecordingId).toBe(getCurrentRecordingIdFromOwner);
  expect(getRecordingTabId).toBe(getRecordingTabIdFromOwner);
  expect(handleTabClose).toBe(handleTabCloseFromOwner);
  expect(handleTabRecordingDebuggerDetach).toBe(handleTabRecordingDebuggerDetachFromOwner);
  expect(handleTabRecordingNavigationCommitted).toBe(
    handleTabRecordingNavigationCommittedFromOwner
  );
  expect(handleTabRecordingNavigationCompleted).toBe(
    handleTabRecordingNavigationCompletedFromOwner
  );
  expect(handleTabRecordingNavigationError).toBe(handleTabRecordingNavigationErrorFromOwner);
  expect(handleTabRecordingNavigationStart).toBe(handleTabRecordingNavigationStartFromOwner);
  expect(isRecording).toBe(isRecordingFromOwner);
  expect(notifyRecordingStartFailed).toBe(notifyRecordingStartFailedFromOwner);
  expect(pauseRecording).toBe(pauseRecordingFromOwner);
  expect(resetRecordingId).toBe(resetRecordingIdFromOwner);
  expect(resetRecordingTabId).toBe(resetRecordingTabIdFromOwner);
  expect(resumeRecording).toBe(resumeRecordingFromOwner);
  expect(stopRecording).toBe(stopRecordingFromOwner);
});
