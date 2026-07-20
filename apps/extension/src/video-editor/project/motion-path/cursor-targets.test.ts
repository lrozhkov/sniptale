import { expect, it } from 'vitest';

import { isDistinctCursorTarget } from './cursor-targets';

it('keeps the first cursor target and enforces the 120px distance boundary', () => {
  const samples = [
    { x: 0, y: 0 },
    { x: 119, y: 0 },
    { x: 239, y: 0 },
  ];

  expect(isDistinctCursorTarget(samples[0]!, 0, samples)).toBe(true);
  expect(isDistinctCursorTarget(samples[1]!, 1, samples)).toBe(false);
  expect(isDistinctCursorTarget(samples[2]!, 2, samples)).toBe(true);
});
