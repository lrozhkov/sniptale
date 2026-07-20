import { expect, it } from 'vitest';
import { resamplePointCloud } from './sampling';

it('resamples open point clouds and pads zero-length strokes', () => {
  expect(
    resamplePointCloud(
      [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
      ],
      3
    )
  ).toEqual([
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 20, y: 0 },
  ]);

  expect(resamplePointCloud([{ x: 3, y: 4 }], 3)).toEqual([
    { x: 3, y: 4 },
    { x: 3, y: 4 },
    { x: 3, y: 4 },
  ]);
});
