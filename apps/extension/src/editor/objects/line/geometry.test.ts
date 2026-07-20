import { describe, expect, it } from 'vitest';

import {
  distanceSquared,
  normalizeLinePoints,
  parseLinePointsJson,
  shouldCloseLine,
} from './geometry';

describe('line geometry', () => {
  it('keeps at least two points for fabric path objects', () => {
    expect(normalizeLinePoints([{ x: 12, y: 8 }])).toEqual([
      { x: 12, y: 8 },
      { x: 12, y: 8 },
    ]);
    expect(parseLinePointsJson('[{"x":1,"y":2},{"x":3,"y":4}]')).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
  });

  it('detects a closing click only near the first point after a polyline exists', () => {
    const points = [
      { x: 10, y: 10 },
      { x: 90, y: 10 },
      { x: 90, y: 80 },
    ];

    expect(shouldCloseLine(points, { x: 16, y: 14 }, 10)).toBe(true);
    expect(shouldCloseLine(points.slice(0, 2), { x: 16, y: 14 }, 10)).toBe(false);
    expect(shouldCloseLine(points, { x: 40, y: 40 }, 10)).toBe(false);
    expect(distanceSquared(points[0]!, points[1]!)).toBe(6400);
  });
});
