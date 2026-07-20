import { expect, it, vi } from 'vitest';

const {
  finalizeRecordingDiagnosticsFromOwner,
  getCurrentRecordingIdFromOwner,
  getRecordingTabIdFromOwner,
  handleTabCloseFromOwner,
  handleTabUpdatedFromOwner,
  isRecordingFromOwner,
  resetRecordingIdFromOwner,
  resetRecordingTabIdFromOwner,
  notifyRecordingStartFailedFromOwner,
  pauseRecordingFromOwner,
  resumeRecordingFromOwner,
  stopRecordingFromOwner,
  handleViewportRecordingDebuggerDetachFromOwner,
  handleViewportRecordingNavigationStartFromOwner,
} = vi.hoisted(() => ({
  finalizeRecordingDiagnosticsFromOwner: vi.fn(),
  getCurrentRecordingIdFromOwner: vi.fn(),
  getRecordingTabIdFromOwner: vi.fn(),
  handleTabCloseFromOwner: vi.fn(),
  handleTabUpdatedFromOwner: vi.fn(),
  isRecordingFromOwner: vi.fn(),
  resetRecordingIdFromOwner: vi.fn(),
  resetRecordingTabIdFromOwner: vi.fn(),
  notifyRecordingStartFailedFromOwner: vi.fn(),
  pauseRecordingFromOwner: vi.fn(),
  resumeRecordingFromOwner: vi.fn(),
  stopRecordingFromOwner: vi.fn(),
  handleViewportRecordingDebuggerDetachFromOwner: vi.fn(),
  handleViewportRecordingNavigationStartFromOwner: vi.fn(),
}));

vi.mock('./runtime', () => ({
  finalizeRecordingDiagnostics: finalizeRecordingDiagnosticsFromOwner,
  getCurrentRecordingId: getCurrentRecordingIdFromOwner,
  getRecordingTabId: getRecordingTabIdFromOwner,
  handleTabClose: handleTabCloseFromOwner,
  handleTabUpdated: handleTabUpdatedFromOwner,
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

vi.mock('./viewport-navigation', () => ({
  handleViewportRecordingDebuggerDetach: handleViewportRecordingDebuggerDetachFromOwner,
  handleViewportRecordingNavigationStart: handleViewportRecordingNavigationStartFromOwner,
}));

import {
  finalizeRecordingDiagnostics,
  getCurrentRecordingId,
  getRecordingTabId,
  handleTabClose,
  handleTabUpdated,
  handleViewportRecordingDebuggerDetach,
  handleViewportRecordingNavigationStart,
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
  expect(handleTabUpdated).toBe(handleTabUpdatedFromOwner);
  expect(handleViewportRecordingDebuggerDetach).toBe(
    handleViewportRecordingDebuggerDetachFromOwner
  );
  expect(handleViewportRecordingNavigationStart).toBe(
    handleViewportRecordingNavigationStartFromOwner
  );
  expect(isRecording).toBe(isRecordingFromOwner);
  expect(notifyRecordingStartFailed).toBe(notifyRecordingStartFailedFromOwner);
  expect(pauseRecording).toBe(pauseRecordingFromOwner);
  expect(resetRecordingId).toBe(resetRecordingIdFromOwner);
  expect(resetRecordingTabId).toBe(resetRecordingTabIdFromOwner);
  expect(resumeRecording).toBe(resumeRecordingFromOwner);
  expect(stopRecording).toBe(stopRecordingFromOwner);
});
