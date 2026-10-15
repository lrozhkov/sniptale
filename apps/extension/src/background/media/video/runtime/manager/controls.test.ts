import { expect, it, vi } from 'vitest';

const {
  notifyRecordingStartFailedFromOwner,
  pauseRecordingFromOwner,
  resumeRecordingFromOwner,
  stopRecordingFromOwner,
  overlayRetryDelaysFromOwner,
} = vi.hoisted(() => ({
  notifyRecordingStartFailedFromOwner: vi.fn(),
  pauseRecordingFromOwner: vi.fn(),
  resumeRecordingFromOwner: vi.fn(),
  stopRecordingFromOwner: vi.fn(),
  overlayRetryDelaysFromOwner: [0, 250, 1000],
}));

vi.mock('../recording-completion', () => ({
  notifyRecordingStartFailed: notifyRecordingStartFailedFromOwner,
  OVERLAY_RESTORE_RETRY_DELAYS_MS: overlayRetryDelaysFromOwner,
  stopRecording: stopRecordingFromOwner,
}));

vi.mock('./controls.pause-resume', () => ({
  pauseRecording: pauseRecordingFromOwner,
  resumeRecording: resumeRecordingFromOwner,
}));

import {
  OVERLAY_RESTORE_RETRY_DELAYS_MS,
  notifyRecordingStartFailed,
  pauseRecording,
  resumeRecording,
  stopRecording,
} from './controls';

it('re-exports control seams without wrapping', () => {
  expect(notifyRecordingStartFailed).toBe(notifyRecordingStartFailedFromOwner);
  expect(pauseRecording).toBe(pauseRecordingFromOwner);
  expect(resumeRecording).toBe(resumeRecordingFromOwner);
  expect(stopRecording).toBe(stopRecordingFromOwner);
  expect(OVERLAY_RESTORE_RETRY_DELAYS_MS).toBe(overlayRetryDelaysFromOwner);
});
