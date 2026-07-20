import { expect, it } from 'vitest';

import {
  getFrameDrivenKeyframeInterval,
  getRenderLoopCurrentTime,
  getRenderLoopDuration,
  getRenderLoopFps,
  getRenderLoopFrameDurationUs,
  getRenderLoopTotalFrames,
} from './timing';

it('normalizes render-loop timing math', () => {
  expect(getRenderLoopDuration(0)).toBe(0.1);
  expect(getRenderLoopFps(0)).toBe(1);
  expect(getRenderLoopTotalFrames(0.1, 1)).toBe(1);
  expect(getRenderLoopFrameDurationUs(1)).toBe(1_000_000);
  expect(getFrameDrivenKeyframeInterval(1)).toBe(2);
});

it('derives the current time from the frame index and duration', () => {
  expect(getRenderLoopCurrentTime(3, 6, 10)).toBe(0.5);
});
