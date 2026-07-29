import { expect, it, vi } from 'vitest';

const {
  finalizeRecordingDiagnosticsFromOwner,
  getCurrentRecordingIdFromOwner,
  getRecordingTabIdFromOwner,
  handleTabCloseFromOwner,
  isRecordingFromOwner,
  resetRecordingIdFromOwner,
  resetRecordingTabIdFromOwner,
} = vi.hoisted(() => ({
  finalizeRecordingDiagnosticsFromOwner: vi.fn(),
  getCurrentRecordingIdFromOwner: vi.fn(),
  getRecordingTabIdFromOwner: vi.fn(),
  handleTabCloseFromOwner: vi.fn(),
  isRecordingFromOwner: vi.fn(),
  resetRecordingIdFromOwner: vi.fn(),
  resetRecordingTabIdFromOwner: vi.fn(),
}));

vi.mock('./runtime/recording-state', () => ({
  finalizeRecordingDiagnostics: finalizeRecordingDiagnosticsFromOwner,
  getCurrentRecordingId: getCurrentRecordingIdFromOwner,
  getRecordingTabId: getRecordingTabIdFromOwner,
  isRecording: isRecordingFromOwner,
  resetRecordingId: resetRecordingIdFromOwner,
  resetRecordingTabId: resetRecordingTabIdFromOwner,
}));

vi.mock('./runtime/tab-close', () => ({
  handleTabClose: handleTabCloseFromOwner,
}));

import {
  finalizeRecordingDiagnostics,
  getCurrentRecordingId,
  getRecordingTabId,
  handleTabClose,
  isRecording,
  resetRecordingId,
  resetRecordingTabId,
} from './runtime';

it('re-exports runtime seams without wrapping', () => {
  expect(finalizeRecordingDiagnostics).toBe(finalizeRecordingDiagnosticsFromOwner);
  expect(getCurrentRecordingId).toBe(getCurrentRecordingIdFromOwner);
  expect(getRecordingTabId).toBe(getRecordingTabIdFromOwner);
  expect(handleTabClose).toBe(handleTabCloseFromOwner);
  expect(isRecording).toBe(isRecordingFromOwner);
  expect(resetRecordingId).toBe(resetRecordingIdFromOwner);
  expect(resetRecordingTabId).toBe(resetRecordingTabIdFromOwner);
});
