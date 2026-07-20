import { describe, expect, it } from 'vitest';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { createIdleState } from './idle-state';

describe('video-session-state idle state', () => {
  it('returns the canonical idle runtime shape', () => {
    expect(createIdleState()).toEqual({
      status: VideoRecordingStatus.IDLE,
      duration: 0,
      countdownEndsAt: null,
      captureMode: null,
      captureSource: null,
      viewportPreset: null,
      liveMedia: null,
      error: null,
    });
  });
});
