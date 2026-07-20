import { expect, it } from 'vitest';

import { getFrameDrivenRenderCurrentTime, getFrameDrivenRenderTiming } from './timing';

it('normalizes frame-driven timing and keyframe cadence', () => {
  expect(getFrameDrivenRenderTiming(0, 0)).toEqual({
    duration: 0.1,
    fps: 1,
    frameDurationUs: 1_000_000,
    keyframeInterval: 2,
    totalFrames: 1,
  });
});

it('derives the current time from the frame index and normalized fps', () => {
  expect(getFrameDrivenRenderCurrentTime(3, 6, 10)).toBe(0.5);
});
