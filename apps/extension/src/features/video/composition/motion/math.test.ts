import { expect, it } from 'vitest';

import { VideoTemporalEasing } from '../../project/types/index';
import { applyTemporalEasing, clampProgress, lerpNumber, lerpPoint } from './math';

it('shares motion interpolation math across camera owners', () => {
  expect(clampProgress(-1)).toBe(0);
  expect(clampProgress(2)).toBe(1);
  expect(applyTemporalEasing(0.5, VideoTemporalEasing.LINEAR)).toBe(0.5);
  expect(applyTemporalEasing(0.5, VideoTemporalEasing.EASE_OUT)).toBe(0.75);
  expect(applyTemporalEasing(0.25, VideoTemporalEasing.EASE_IN_OUT)).toBe(0.0625);
  expect(applyTemporalEasing(0, VideoTemporalEasing.INSTANT)).toBe(0);
  expect(applyTemporalEasing(0.1, VideoTemporalEasing.INSTANT)).toBe(1);
  expect(lerpNumber(10, 20, 0.25)).toBe(12.5);
  expect(lerpPoint({ x: 0, y: 10 }, { x: 10, y: 30 }, 0.5)).toEqual({ x: 5, y: 20 });
});
