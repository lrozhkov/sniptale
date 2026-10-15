import { expect, it } from 'vitest';
import { parseCutTransition } from './cut-transition';
it('preserves authored join transition timing and optional opaque color', () => {
  expect(parseCutTransition({ type: 'dissolve', before: 0.2, after: 0.3 })).toEqual({
    type: 'dissolve',
    before: 0.2,
    after: 0.3,
  });
  expect(
    parseCutTransition({ type: 'fade-black', before: 0, after: 1, color: '#ff0000ff' })
  ).toEqual({ type: 'fade-black', before: 0, after: 1, color: '#ff0000ff' });
});
it.each([
  null,
  {},
  { type: 'dissolve', before: -1, after: 2 },
  { type: 'dissolve', before: 0, after: 0 },
  { type: 'dissolve', before: 30, after: 31 },
  { type: 'dissolve', before: NaN, after: 1 },
  { type: 'fade-black', before: 1, after: 1, color: '#ffffff00' },
])('rejects unsupported transition %j', (raw) => {
  expect(parseCutTransition(raw)).toBeNull();
});
