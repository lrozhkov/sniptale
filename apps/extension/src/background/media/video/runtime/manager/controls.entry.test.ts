import { expect, it, vi } from 'vitest';

const {
  notifyRecordingStartFailedFromOwner,
  OVERLAY_RESTORE_RETRY_DELAYS_MSFromOwner,
  pauseRecordingFromOwner,
  resumeRecordingFromOwner,
  stopRecordingFromOwner,
} = vi.hoisted(() => ({
  notifyRecordingStartFailedFromOwner: vi.fn(),
  OVERLAY_RESTORE_RETRY_DELAYS_MSFromOwner: [0, 250, 1000],
  pauseRecordingFromOwner: vi.fn(),
  resumeRecordingFromOwner: vi.fn(),
  stopRecordingFromOwner: vi.fn(),
}));

vi.mock('./controls', () => ({
  notifyRecordingStartFailed: notifyRecordingStartFailedFromOwner,
  OVERLAY_RESTORE_RETRY_DELAYS_MS: OVERLAY_RESTORE_RETRY_DELAYS_MSFromOwner,
  pauseRecording: pauseRecordingFromOwner,
  resumeRecording: resumeRecordingFromOwner,
  stopRecording: stopRecordingFromOwner,
}));

import {
  notifyRecordingStartFailed,
  OVERLAY_RESTORE_RETRY_DELAYS_MS,
  pauseRecording,
  resumeRecording,
  stopRecording,
} from './controls';

it('re-exports the runtime controls facade without wrapping', () => {
  expect(notifyRecordingStartFailed).toBe(notifyRecordingStartFailedFromOwner);
  expect(OVERLAY_RESTORE_RETRY_DELAYS_MS).toBe(OVERLAY_RESTORE_RETRY_DELAYS_MSFromOwner);
  expect(pauseRecording).toBe(pauseRecordingFromOwner);
  expect(resumeRecording).toBe(resumeRecordingFromOwner);
  expect(stopRecording).toBe(stopRecordingFromOwner);
});
