import { beforeEach, describe, expect, it } from 'vitest';
import {
  acquireOffscreenMediaActivityLease,
  inspectOffscreenMediaActivityOwner,
  resetOffscreenMediaActivityLeaseForTests,
} from './lease';
import {
  acquireVideoRecordingMediaActivityLease,
  releaseVideoRecordingMediaActivityLease,
} from './video-recording-lease';

describe('offscreen media activity lease', () => {
  beforeEach(resetOffscreenMediaActivityLeaseForTests);

  it('arbitrates speech and video atomically in both directions', () => {
    const speech = acquireOffscreenMediaActivityLease('speech-recognition');
    expect(speech.acquired).toBe(true);
    expect(acquireOffscreenMediaActivityLease('video-recording')).toEqual({
      acquired: false,
      busyOwner: 'speech-recognition',
    });
    if (speech.acquired) speech.lease.release();

    const video = acquireOffscreenMediaActivityLease('video-recording');
    expect(video.acquired).toBe(true);
    expect(acquireOffscreenMediaActivityLease('speech-recognition')).toEqual({
      acquired: false,
      busyOwner: 'video-recording',
    });
    if (video.acquired) {
      video.lease.release();
      video.lease.release();
    }
    expect(inspectOffscreenMediaActivityOwner()).toBeNull();
  });

  it('does not retain a video owner when another media activity already owns the lease', () => {
    releaseVideoRecordingMediaActivityLease();
    const speech = acquireOffscreenMediaActivityLease('speech-recognition');
    expect(acquireVideoRecordingMediaActivityLease()).toEqual({
      acquired: false,
      busyOwner: 'speech-recognition',
    });
    releaseVideoRecordingMediaActivityLease();
    if (speech.acquired) speech.lease.release();
  });
});
