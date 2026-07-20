import { expect, it } from 'vitest';
import { readLineNumber } from './number';

it('uses numeric line metadata and falls back for non-numeric values', () => {
  expect(readLineNumber(4, 1)).toBe(4);
  expect(readLineNumber('4', 1)).toBe(1);
  expect(readLineNumber(undefined, 1)).toBe(1);
});
