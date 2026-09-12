import { expect, it } from 'vitest';
import { snapGuideSize } from './resize-snapping';
it('chooses only the nearest target within tolerance and releases beyond it', () => {
  expect(snapGuideSize(49, [33, 50, 75], 1.5)).toEqual({ value: 50, matched: true });
  expect(snapGuideSize(48, [33, 50, 75], 1.5)).toEqual({ value: 48, matched: false });
  expect(snapGuideSize(123, [120, 128], 6)).toEqual({ value: 120, matched: true });
  expect(snapGuideSize(123, [], 6)).toEqual({ value: 123, matched: false });
});
