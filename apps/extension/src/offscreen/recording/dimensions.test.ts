import { expect, it } from 'vitest';

import {
  isRecordingSafeSize,
  resolveRecordingSafeDimension,
  resolveRecordingSafeSize,
} from './dimensions';

it('normalizes recording dimensions to positive even codec-safe values', () => {
  expect(resolveRecordingSafeDimension(1365)).toBe(1364);
  expect(resolveRecordingSafeDimension(1366)).toBe(1366);
  expect(resolveRecordingSafeDimension(1)).toBe(1);
  expect(resolveRecordingSafeDimension(0)).toBe(1);
  expect(resolveRecordingSafeDimension(100.6)).toBe(100);
});

it('normalizes and detects recording-safe frame sizes', () => {
  expect(resolveRecordingSafeSize({ width: 1365, height: 767 })).toEqual({
    width: 1364,
    height: 766,
  });
  expect(isRecordingSafeSize({ width: 1364, height: 766 })).toBe(true);
  expect(isRecordingSafeSize({ width: 1365, height: 767 })).toBe(false);
});
