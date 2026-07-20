import { expect, it } from 'vitest';
import { matchesRasterTolerance, pushRasterPixelNeighbors, readRasterPixel } from './pixels';

it('reads raster pixels with zero fallback for missing channels', () => {
  const data = new Uint8ClampedArray([1, 2, 3, 4, 9, 8, 7]);

  expect(readRasterPixel(data, 0, 0, 2)).toEqual([1, 2, 3, 4]);
  expect(readRasterPixel(data, 1, 0, 2)).toEqual([9, 8, 7, 0]);
});

it('matches pixels by summed channel tolerance', () => {
  expect(matchesRasterTolerance([10, 20, 30, 40], [12, 22, 33, 41], 10)).toBe(true);
  expect(matchesRasterTolerance([10, 20, 30, 40], [20, 30, 40, 50], 10)).toBe(false);
});

it('pushes bounded four-way raster neighbors', () => {
  const queue: number[] = [];
  pushRasterPixelNeighbors(queue, 5, 1, 1, 4, 4);
  expect(queue).toEqual([4, 6, 1, 9]);

  const cornerQueue: number[] = [];
  pushRasterPixelNeighbors(cornerQueue, 0, 0, 0, 4, 4);
  expect(cornerQueue).toEqual([1, 4]);
});
