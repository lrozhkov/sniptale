import { expect, it } from 'vitest';
import { isSharpCorner } from './corners';
import { interpolateByDistance, interpolatePoint } from './interpolation';
import { resolveSmoothingIterations } from './iterations';
import { smoothDynamicStrokePoints } from './pass';
import { resampleDynamicStrokePointsWithStep } from './resample';

it('owns smoothing iteration limits and point interpolation', () => {
  expect(resolveSmoothingIterations(10, 4)).toBe(4);
  expect(resolveSmoothingIterations(-1, undefined)).toBe(0);
  expect(interpolatePoint({ width: 1, x: 0, y: 0 }, { width: 5, x: 10, y: 20 }, 0.5)).toEqual({
    width: 3,
    x: 5,
    y: 10,
  });
  expect(interpolateByDistance({ width: 1, x: 0, y: 0 }, { width: 5, x: 0, y: 0 }, 3)).toEqual({
    width: 1,
    x: 0,
    y: 0,
  });
});

it('owns dynamic stroke resampling across segment carry distance', () => {
  expect(
    resampleDynamicStrokePointsWithStep(
      [
        { width: 2, x: 0, y: 0 },
        { width: 2, x: 5, y: 0 },
        { width: 2, x: 10, y: 0 },
      ],
      4
    ).map((point) => point.x)
  ).toEqual([0, 4, 8, 10]);
});

it('owns sharp corner weighting and smoothing pass endpoints', () => {
  expect(
    isSharpCorner({ width: 2, x: 0, y: 0 }, { width: 2, x: 1, y: 0 }, { width: 2, x: 1, y: 1 })
  ).toBe(true);
  expect(
    isSharpCorner({ width: 2, x: 0, y: 0 }, { width: 2, x: 0, y: 0 }, { width: 2, x: 1, y: 1 })
  ).toBe(false);

  const smoothed = smoothDynamicStrokePoints(
    [
      { width: 2, x: 0, y: 0 },
      { width: 8, x: 6, y: 6 },
      { width: 2, x: 12, y: 0 },
    ],
    1,
    { smoothingIterationLimit: 1, smoothingStepPx: 6 }
  );
  expect(smoothed[0]).toEqual({ width: 2, x: 0, y: 0 });
  expect(smoothed.at(-1)).toEqual({ width: 2, x: 12, y: 0 });
});

it('owns default smoothing resample path and short-stroke early exit', () => {
  expect(smoothDynamicStrokePoints([{ width: 2, x: 0, y: 0 }], 4)).toEqual([
    { width: 2, x: 0, y: 0 },
  ]);

  const smoothed = smoothDynamicStrokePoints(
    [
      { width: 2, x: 0, y: 0 },
      { width: 8, x: 4, y: 2 },
      { width: 2, x: 8, y: 0 },
    ],
    1
  );
  expect(smoothed.length).toBeGreaterThan(3);
  expect(smoothed[0]).toEqual({ width: 2, x: 0, y: 0 });
  expect(smoothed.at(-1)).toEqual({ width: 2, x: 8, y: 0 });
});
