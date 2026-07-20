import { expect, it } from 'vitest';
import { hasProjectExportRange, resolveProjectExportRange } from './range';

it('clamps export ranges to the project duration bounds', () => {
  expect(
    resolveProjectExportRange({ duration: 10 } as never, {
      rangeEndSeconds: 18,
      rangeStartSeconds: -2,
    })
  ).toEqual({
    duration: 10,
    end: 10,
    start: 0,
  });
});

it('preserves subranges and keeps a minimum duration for collapsed selections', () => {
  expect(
    resolveProjectExportRange({ duration: 12 } as never, {
      rangeEndSeconds: 5,
      rangeStartSeconds: 5,
    })
  ).toEqual({
    duration: 0.1,
    end: 5,
    start: 5,
  });
  expect(
    hasProjectExportRange({ duration: 12 } as never, { rangeEndSeconds: 8, rangeStartSeconds: 3 })
  ).toBe(true);
  expect(hasProjectExportRange({ duration: 12 } as never, {})).toBe(false);
});
