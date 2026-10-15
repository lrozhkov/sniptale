import { expect, it } from 'vitest';
import { createReviewPlaybackRange, reviewPlaybackRangeStart } from './playback-range';

it('normalizes reversed, clamped source intervals and rejects nonfinite or short spans', () => {
  expect(createReviewPlaybackRange(8, 2, 10)).toEqual({ start: 2, end: 8 });
  expect(createReviewPlaybackRange(-2, 12, 10)).toEqual({ start: 0, end: 10 });
  expect(createReviewPlaybackRange(1, 1.05, 10)).toEqual({ start: 1, end: 1.05 });
  expect(createReviewPlaybackRange(1, 1.04, 10)).toBeNull();
  expect(createReviewPlaybackRange(NaN, 4, 10)).toBeNull();
  expect(createReviewPlaybackRange(1, 4, Infinity)).toBeNull();
  expect(createReviewPlaybackRange(11, 12, 10)).toBeNull();
});

it('finds kept samples across adjacent cuts without admitting an excluded end', () => {
  const cuts = [
    { id: 'a', kind: 'cut' as const, start: 1, end: 2, requestedStart: 1, requestedEnd: 2 },
    {
      id: 'b',
      kind: 'cut' as const,
      start: 2,
      end: 3.123456789,
      requestedStart: 2,
      requestedEnd: 3.123456789,
    },
  ];
  expect(reviewPlaybackRangeStart({ start: 1.5, end: 4 }, cuts)).toBe(3.123457);
  expect(reviewPlaybackRangeStart({ start: 1.5, end: 3.123456789 }, cuts)).toBeNull();
  expect(reviewPlaybackRangeStart({ start: 0.5, end: 2 }, cuts)).toBe(0.5);
});
