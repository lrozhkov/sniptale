import { expect, it } from 'vitest';
import { parseQuickEditShadow } from './shadow-validation';
it.each([0, 100])('admits bounded shadow intensity %s with canonical color', (intensity) => {
  expect(parseQuickEditShadow({ intensity, color: '#47556980' })).toEqual({
    intensity,
    color: '#47556980',
  });
});
it.each([
  null,
  [],
  { intensity: -1, color: '#000000' },
  { intensity: 101, color: '#000000' },
  { intensity: NaN, color: '#000000' },
  { intensity: Infinity, color: '#000000' },
  { intensity: '1', color: '#000000' },
  { intensity: 1, color: 'url(https://invalid.test)' },
  { intensity: 1, color: 1 },
  { intensity: 1 },
])('rejects malformed or unsafe shadow %j', (value) => {
  expect(parseQuickEditShadow(value)).toBeNull();
});
