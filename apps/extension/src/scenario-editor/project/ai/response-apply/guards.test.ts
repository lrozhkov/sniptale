import { expect, it } from 'vitest';

import { clamp, isFiniteNumber } from './guards';

it('clamps numeric values and narrows finite numbers', () => {
  expect(clamp(5, 0, 3)).toBe(3);
  expect(clamp(-1, 0, 3)).toBe(0);
  expect(isFiniteNumber(3)).toBe(true);
  expect(isFiniteNumber(Number.NaN)).toBe(false);
});
