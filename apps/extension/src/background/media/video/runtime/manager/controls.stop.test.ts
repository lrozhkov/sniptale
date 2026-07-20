import { expect, it, vi } from 'vitest';

const { cancelRecordingStartFromOwner, overlayRetryDelaysFromOwner, stopRecordingFromOwner } =
  vi.hoisted(() => ({
    cancelRecordingStartFromOwner: vi.fn(),
    overlayRetryDelaysFromOwner: [0, 250, 1000],
    stopRecordingFromOwner: vi.fn(),
  }));

vi.mock('./controls.stop/flow', () => ({
  cancelRecordingStart: cancelRecordingStartFromOwner,
  OVERLAY_RESTORE_RETRY_DELAYS_MS: overlayRetryDelaysFromOwner,
  stopRecording: stopRecordingFromOwner,
  stopRecordingForPrivacyErasure: vi.fn(),
}));

import {
  cancelRecordingStart,
  OVERLAY_RESTORE_RETRY_DELAYS_MS,
  stopRecording,
} from './controls.stop';

it('re-exports the stop seam without wrapping', () => {
  expect(cancelRecordingStart).toBe(cancelRecordingStartFromOwner);
  expect(OVERLAY_RESTORE_RETRY_DELAYS_MS).toBe(overlayRetryDelaysFromOwner);
  expect(stopRecording).toBe(stopRecordingFromOwner);
});
