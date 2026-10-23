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

it('does not extend a positive sub-frame MP4 span into the next GOP', () => {
  const end = 1 / 60;
  const duration = getRenderLoopDuration(end);
  const frames = getRenderLoopTotalFrames(duration, 40);
  expect(duration).toBe(end);
  expect(frames).toBe(1);
  expect((frames - 1) / 40).toBeLessThan(end);
});

it('counts complete output timestamps on the microsecond clock without floating-point extra frames', () => {
  expect(getRenderLoopTotalFrames(0.2 - 0.175, 40)).toBe(1);
  expect(getRenderLoopTotalFrames(2 / 30, 30)).toBe(2);
  expect(getRenderLoopTotalFrames(0.100001, 30)).toBe(4);
});
