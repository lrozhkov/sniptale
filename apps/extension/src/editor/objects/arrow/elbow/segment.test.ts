import { expect, it } from 'vitest';
import { getElbowSegmentMidpoint, isElbowInternalSegment, moveElbowSegment } from './segment';

const route = [
  { x: 0, y: 0 },
  { x: 50, y: 0 },
  { x: 50, y: 40 },
  { x: 100, y: 40 },
];

it('exposes only internal elbow segment midpoint handles', () => {
  expect(isElbowInternalSegment(route, 1)).toBe(false);
  expect(isElbowInternalSegment(route, 2)).toBe(true);
  expect(isElbowInternalSegment(route, 3)).toBe(false);
  expect(getElbowSegmentMidpoint(route, 2)).toEqual({ x: 50, y: 20 });
});

it('moves an internal elbow segment along its locked axis', () => {
  expect(moveElbowSegment(route, 2, { x: 70, y: 25 })).toEqual([
    { x: 0, y: 0 },
    { x: 70, y: 0 },
    { x: 70, y: 40 },
    { x: 100, y: 40 },
  ]);
  expect(moveElbowSegment(route, 1, { x: 70, y: 25 })).toEqual(route);
});
