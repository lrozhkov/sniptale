import { expect, it } from 'vitest';
import { fitRasterCropRatio, hitRasterCrop, transformRasterCrop } from './crop';

it('changes the existing frame ratio around its center within the source', () => {
  expect(fitRasterCropRatio({ x: 20, y: 10, width: 100, height: 40 }, 2)).toEqual({
    x: 30,
    y: 10,
    width: 80,
    height: 40,
  });
});
it('moves the existing frame without changing size and clamps it to the source', () => {
  expect(
    transformRasterCrop(
      { width: 200, height: 100 },
      { x: 20, y: 10, width: 100, height: 40 },
      'move',
      { x: 150, y: -50 },
      null
    )
  ).toEqual({ x: 100, y: 0, width: 100, height: 40 });
});
it('resizes opposite anchored corners proportionally and stops at source edges', () => {
  expect(
    transformRasterCrop(
      { width: 200, height: 100 },
      { x: 20, y: 10, width: 80, height: 40 },
      'se',
      { x: 160, y: 80 },
      2
    )
  ).toEqual({ x: 20, y: 10, width: 180, height: 90 });
  expect(
    transformRasterCrop(
      { width: 200, height: 100 },
      { x: 20, y: 10, width: 80, height: 40 },
      'nw',
      { x: 20, y: 10 },
      2
    )
  ).toEqual({ x: 40, y: 20, width: 60, height: 30 });
});
it('resizes an edge with fixed ratio around the perpendicular center', () => {
  expect(
    transformRasterCrop(
      { width: 200, height: 100 },
      { x: 20, y: 20, width: 80, height: 40 },
      'e',
      { x: 20, y: 0 },
      2
    )
  ).toEqual({ x: 20, y: 15, width: 100, height: 50 });
});
it('uses supplied source tolerances for handles and distinguishes interior and exterior', () => {
  const bounds = { x: 20, y: 10, width: 100, height: 40 };
  expect(hitRasterCrop(bounds, { x: 18, y: 9 }, { x: 3, y: 2 })).toBe('nw');
  expect(hitRasterCrop(bounds, { x: 70, y: 12 }, { x: 3, y: 2 })).toBe('n');
  expect(hitRasterCrop(bounds, { x: 70, y: 30 }, { x: 3, y: 2 })).toBe('move');
  expect(hitRasterCrop(bounds, { x: 10, y: 30 }, { x: 3, y: 2 })).toBe('new');
});
