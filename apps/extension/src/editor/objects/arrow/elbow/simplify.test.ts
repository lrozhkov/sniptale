import { expect, it } from 'vitest';
import { simplifyElbowPoints } from './simplify';

it('deduplicates close elbow points while preserving collapsed draft endpoints', () => {
  expect(
    simplifyElbowPoints([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ])
  ).toEqual([
    { x: 1, y: 1 },
    { x: 2, y: 2 },
  ]);
});

it('removes redundant collinear elbow points', () => {
  expect(
    simplifyElbowPoints([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 40 },
    ])
  ).toEqual([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 40 },
  ]);
});
