import { expect, it, vi } from 'vitest';
import { recordingContext } from '../context';

it('does not publish duration updates after artifact cleanup resets the recording identity', () => {
  const publish = vi.spyOn(recordingContext.durationTracker, 'publishDuration');
  recordingContext.resetRecordingSession();
  recordingContext.durationTracker.publishDuration();
  expect(publish).toHaveBeenCalledOnce();
  expect(recordingContext.currentRecordingId).toBeNull();
});
