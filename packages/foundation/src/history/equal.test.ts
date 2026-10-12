import { expect, it } from 'vitest';
import { sameHistoryArray, sameHistoryRecord } from './equal';
it('preserves the caller equality policy for NaN and signed zero', () => {
  expect(sameHistoryArray([NaN, -0], [NaN, -0], Object.is)).toBe(true);
  expect(sameHistoryArray([0], [-0], Object.is)).toBe(false);
  expect(sameHistoryArray([0], [-0], (a, b) => a === b)).toBe(true);
  expect(sameHistoryArray([1], [], Object.is)).toBe(false);
});
it('requires the same own enumerable fields rather than prototype lookups', () => {
  expect(sameHistoryRecord({ a: 1 }, { a: 1 }, Object.is)).toBe(true);
  expect(sameHistoryRecord({ a: 1 }, { b: 1 }, Object.is)).toBe(false);
  expect(sameHistoryRecord({ a: 1 }, { a: 1, b: 2 }, Object.is)).toBe(false);
  const inherited = Object.assign(Object.create({ a: 1 }), { b: 1 });
  expect(sameHistoryRecord({ a: 1 }, inherited, Object.is)).toBe(false);
});
