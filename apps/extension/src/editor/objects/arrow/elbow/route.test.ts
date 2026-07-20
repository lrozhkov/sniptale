import { expect, it } from 'vitest';
import { normalizeElbowPoints } from './route';

it('builds centered orthogonal elbow routes for diagonal endpoints', () => {
  expect(
    normalizeElbowPoints([
      { x: 0, y: 0 },
      { x: 100, y: 40 },
    ])
  ).toEqual([
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 50, y: 40 },
    { x: 100, y: 40 },
  ]);
});
