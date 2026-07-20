import { expect, it } from 'vitest';

import { clampSketchValue, createSketchNoise, formatSketchNumber } from './numeric';

it('formats, clamps, and generates bounded deterministic sketch numbers', () => {
  expect(formatSketchNumber(1.23456)).toBe('1.235');
  expect(clampSketchValue(12, 0, 10)).toBe(10);
  expect(createSketchNoise(7, 2)).toBe(createSketchNoise(7, 2));
  expect(createSketchNoise(7, 2)).toBeGreaterThanOrEqual(-1);
  expect(createSketchNoise(7, 2)).toBeLessThanOrEqual(1);
});
