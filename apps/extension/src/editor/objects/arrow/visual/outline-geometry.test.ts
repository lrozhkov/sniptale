import { expect, it } from 'vitest';

import { getLineIntersection, getNormal, getSegmentLength } from './outline-geometry';

it('resolves segment normals, lengths, and line intersections for shaft outlines', () => {
  expect(getNormal({ x: 0, y: 0 }, { x: 0, y: 10 })).toEqual({ x: -1, y: 0 });
  expect(getNormal({ x: 2, y: 2 }, { x: 2, y: 2 })).toEqual({ x: 0, y: -1 });
  expect(getSegmentLength({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  expect(
    getLineIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: -5 }, { x: 5, y: 5 })
  ).toEqual({ x: 5, y: 0 });
  expect(
    getLineIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 2 }, { x: 10, y: 2 })
  ).toBeNull();
});
