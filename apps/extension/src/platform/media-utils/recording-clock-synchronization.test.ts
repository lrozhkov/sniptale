import { expect, it } from 'vitest';
import { inferRecordingClockOffset } from './recording-clock-synchronization';
it('bounds a3458ms domain difference with asymmetric delivery and excludes receiver processing', () => {
  const offset = 3458.233;
  const result = inferRecordingClockOffset(
    [
      { a0: 100, b1: 101 + offset, b2: 601 + offset, a3: 603 },
      { a0: 700, b1: 700.2 + offset, b2: 701 + offset, a3: 701.8 },
    ],
    1000 / 120
  )!;
  expect(result.lowerMs).toBeLessThanOrEqual(offset);
  expect(result.upperMs).toBeGreaterThanOrEqual(offset);
  expect(Math.abs(result.offsetMs - offset)).toBeLessThanOrEqual(result.uncertaintyMs);
  expect(result.uncertaintyMs).toBeLessThan(1);
});
it('refuses excessive uncertainty and incompatible measurements instead of selecting a flattering sample', () => {
  expect(inferRecordingClockOffset([{ a0: 0, b1: 10, b2: 10, a3: 100 }], 8)).toBeNull();
  expect(
    inferRecordingClockOffset(
      [
        { a0: 0, b1: 1, b2: 1, a3: 2 },
        { a0: 3, b1: 100, b2: 100, a3: 5 },
      ],
      8
    )
  ).toBeNull();
});
it('rejects nonfinite, reversed, empty and unbounded exchange sets', () => {
  const sample = { a0: 0, b1: 1, b2: 1, a3: 2 };
  for (const exchange of [
    { ...sample, a0: NaN },
    { ...sample, a3: -1 },
    { ...sample, b2: 0 },
  ])
    expect(inferRecordingClockOffset([exchange], 8)).toBeNull();
  expect(inferRecordingClockOffset([], 8)).toBeNull();
  expect(inferRecordingClockOffset(Array(9).fill(sample), 8)).toBeNull();
  for (const budget of [0, -1, NaN, Infinity])
    expect(inferRecordingClockOffset([sample], budget)).toBeNull();
});
it('admits coarsened coincident reads with a nonzero timer allowance', () => {
  expect(inferRecordingClockOffset([{ a0: 10, b1: 10, b2: 10, a3: 10 }], 1)).toEqual({
    lowerMs: -0.2,
    upperMs: 0.2,
    offsetMs: 0,
    uncertaintyMs: 0.2,
  });
});
