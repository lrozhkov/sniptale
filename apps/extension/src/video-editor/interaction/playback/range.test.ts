import { describe, expect, it } from 'vitest';

import { clampPlaybackRange, createPlaybackRange } from './range';

describe('video editor playback range', () => {
  it('normalizes anchor and target into an ordered range', () => {
    expect(createPlaybackRange(4, 1.5)).toEqual({ start: 1.5, end: 4 });
  });

  it('drops ranges below the minimum duration', () => {
    expect(createPlaybackRange(1, 1.02)).toBeNull();
    expect(clampPlaybackRange({ start: -0.02, end: 0.01 }, 10)).toBeNull();
  });

  it('clamps ranges to project duration', () => {
    expect(clampPlaybackRange({ start: -1, end: 12 }, 8)).toEqual({ start: 0, end: 8 });
  });
});
