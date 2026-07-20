import { expect, it } from 'vitest';
import { clampVideoPropertyNumber, VIDEO_CLIP_PROPERTY_LIMITS } from './constraints';

it('clamps video clip property numbers against store-owned limits', () => {
  expect(clampVideoPropertyNumber(999999, VIDEO_CLIP_PROPERTY_LIMITS.transformCoordinate)).toBe(
    7680
  );
  expect(clampVideoPropertyNumber(-999999, VIDEO_CLIP_PROPERTY_LIMITS.transformCoordinate)).toBe(
    -7680
  );
  expect(clampVideoPropertyNumber(Number.NaN, VIDEO_CLIP_PROPERTY_LIMITS.textFontSize)).toBe(10);
});
