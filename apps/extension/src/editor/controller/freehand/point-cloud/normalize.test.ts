import { expect, it } from 'vitest';
import { normalizePointCloud } from './normalize';

it('normalizes sampled points around a zero-centered scale', () => {
  expect(
    normalizePointCloud(
      [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
      ],
      3
    )
  ).toEqual([
    { x: -0.5, y: 0 },
    { x: 0, y: 0 },
    { x: 0.5, y: 0 },
  ]);
});
