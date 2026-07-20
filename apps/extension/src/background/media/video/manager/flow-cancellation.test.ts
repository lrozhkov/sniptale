import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  abortVideoRecordingStartIfCancelled,
  isVideoRecordingStartCancelled,
} from './flow-cancellation';
import { videoManagerSession } from './session';

function resetCancellationState(): void {
  vi.clearAllMocks();
  videoManagerSession.recordingTabId = 7;
  videoManagerSession.currentCaptureMode = CaptureMode.TAB;
}

beforeEach(resetCancellationState);

it('detects when the active recording session no longer matches the start context', () => {
  expect(isVideoRecordingStartCancelled(7, CaptureMode.TAB)).toBe(false);
  videoManagerSession.currentCaptureMode = CaptureMode.CAMERA;
  expect(isVideoRecordingStartCancelled(null, CaptureMode.CAMERA)).toBe(false);
  videoManagerSession.currentCaptureMode = CaptureMode.TAB;
  expect(isVideoRecordingStartCancelled(8, CaptureMode.TAB)).toBe(true);
  expect(isVideoRecordingStartCancelled(7, CaptureMode.SCREEN)).toBe(true);
});

it('logs and returns true when start is cancelled after a specific stage', () => {
  const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  expect(abortVideoRecordingStartIfCancelled(8, CaptureMode.TAB, 'capture source resolution')).toBe(
    true
  );
  expect(consoleLogSpy).toHaveBeenCalledWith(
    '[VideoManager]',
    'Start aborted after capture source resolution'
  );
  expect(abortVideoRecordingStartIfCancelled(7, CaptureMode.TAB, 'countdown')).toBe(false);
});
