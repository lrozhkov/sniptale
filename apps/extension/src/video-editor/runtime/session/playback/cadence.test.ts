import { describe, expect, it } from 'vitest';

import {
  resolvePlaybackFrameStepTime,
  resolvePlaybackFrameTime,
  resolvePlaybackPublishIntervalMs,
  shouldPublishPlaybackTime,
} from './cadence';

describe('video editor playback cadence', () => {
  it('caps UI publication at 30 Hz while respecting lower project FPS', () => {
    expect(resolvePlaybackPublishIntervalMs(60)).toBeCloseTo(1000 / 30);
    expect(resolvePlaybackPublishIntervalMs(24)).toBeCloseTo(1000 / 24);
    expect(shouldPublishPlaybackTime(32, 0, 60)).toBe(false);
    expect(shouldPublishPlaybackTime(34, 0, 60)).toBe(true);
  });

  it('assigns canonical frame samples and preserves the terminal time', () => {
    expect(resolvePlaybackFrameTime(0.417, 1, 30)).toBe(13 / 30);
    expect(resolvePlaybackFrameTime(1, 1, 30)).toBe(1);
  });

  it('steps on the canonical project frame grid and clamps to project bounds', () => {
    expect(resolvePlaybackFrameStepTime(0.417, 1, 30, -1)).toBe(12 / 30);
    expect(resolvePlaybackFrameStepTime(0.417, 1, 30, 1)).toBe(14 / 30);
    expect(resolvePlaybackFrameStepTime(0, 1, 30, -1)).toBe(0);
    expect(resolvePlaybackFrameStepTime(1, 1, 30, 1)).toBe(1);
    expect(resolvePlaybackFrameStepTime(1.01, 1.01, 30, -1)).toBe(1);
  });
});
