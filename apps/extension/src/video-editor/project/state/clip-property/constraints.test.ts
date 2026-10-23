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

it('keeps CAMERA scale bounds while ordinary media supports the already-readable small range', () => {
  expect(clampVideoPropertyNumber(1, VIDEO_CLIP_PROPERTY_LIMITS.fitScalePercent)).toBe(10);
  expect(clampVideoPropertyNumber(1, VIDEO_CLIP_PROPERTY_LIMITS.ordinaryMediaFitScalePercent)).toBe(
    1
  );
  expect(
    clampVideoPropertyNumber(500, VIDEO_CLIP_PROPERTY_LIMITS.ordinaryMediaFitScalePercent)
  ).toBe(300);
});
