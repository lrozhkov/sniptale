import { expect, it } from 'vitest';

import { buildSketchPolylinePoints, getSketchPolylineSegmentPoint } from './sampling';

const options = { bowing: 0, roughness: 0, seed: 1, strokeWidth: 2 };

it('builds sampled points and clamps segment lookup ratios', () => {
  expect(buildSketchPolylinePoints([], options)).toEqual([]);
  expect(buildSketchPolylinePoints([{ x: 0, y: 0 }], options)).toEqual([{ x: 0, y: 0 }]);
  expect(
    buildSketchPolylinePoints(
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
      options
    )
  ).toEqual([{ x: 0, y: 0 }]);

  expect(getSketchPolylineSegmentPoint({ x: 0, y: 0 }, { x: 100, y: 0 }, options, 0, 2)).toEqual({
    x: 100,
    y: 0,
  });
  expect(getSketchPolylineSegmentPoint({ x: 0, y: 0 }, { x: 100, y: 0 }, options, 0, -1)).toEqual({
    x: 0,
    y: 0,
  });
});

it('applies roughness and bowing to interior segment samples', () => {
  const roughPoint = getSketchPolylineSegmentPoint(
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { bowing: 1, roughness: 1, seed: 2, strokeWidth: 8 },
    0,
    0.5
  );

  expect(roughPoint.x).toBeGreaterThan(0);
  expect(roughPoint.x).toBeLessThan(100);
  expect(Math.abs(roughPoint.y)).toBeGreaterThan(0);
});
