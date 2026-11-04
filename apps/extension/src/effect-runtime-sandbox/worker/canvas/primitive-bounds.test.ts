import { expect, it } from 'vitest';
import { primitivePointBounds, primitiveRasterRegion } from './primitive-bounds';
it('contains complete control hulls and rejects uncertain numeric geometry', () => {
  expect(
    primitivePointBounds([
      { x: -5, y: 9 },
      { x: 20, y: -12 },
      { x: 8, y: 1 },
    ])
  ).toEqual({ x: -5, y: -12, width: 25, height: 21 });
  expect(primitivePointBounds([{ x: NaN, y: 0 }])).toBeUndefined();
  expect(primitivePointBounds([])).toBeUndefined();
});
it('rounds transformed negative geometry outward including stroke and effect halos', () => {
  const region = primitiveRasterRegion(
    { x: 12, y: 8, width: -10, height: -5 },
    [0, 2, -3, 0, 50.25, 20.5],
    { width: 200, height: 200 },
    4,
    2
  );
  expect(region).toEqual({ x: 16, y: 16, width: 36, height: 37 });
});
it('retains full unknown geometry and transparent offscreen operands for destructive blends', () => {
  expect(
    primitiveRasterRegion(undefined, [1, 0, 0, 1, 0, 0], { width: 20, height: 10 }, 2)
  ).toEqual({ x: 0, y: 0, width: 20, height: 10 });
  expect(
    primitiveRasterRegion(
      { x: 50, y: 50, width: 1, height: 1 },
      [1, 0, 0, 1, 0, 0],
      { width: 20, height: 10 },
      2
    )
  ).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  expect(
    primitiveRasterRegion(
      { x: 5, y: 5, width: 0, height: 0 },
      [1, 0, 0, 1, 0, 0],
      { width: 20, height: 10 },
      2
    )
  ).toEqual({ x: 3, y: 3, width: 4, height: 4 });
});
