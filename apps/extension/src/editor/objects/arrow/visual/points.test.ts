import { describe, expect, it } from 'vitest';

import {
  circleToPath,
  getFirstPoint,
  getLastPoint,
  polygonToPath,
  rotatePoint,
  translatePoint,
} from './points';

describe('arrow visual point helpers', () => {
  it('reads endpoint helpers and handles empty polygons', () => {
    const points = [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ];

    expect(getFirstPoint(points)).toEqual({ x: 1, y: 2 });
    expect(getLastPoint(points)).toEqual({ x: 3, y: 4 });
    expect(getFirstPoint([])).toBeNull();
    expect(getLastPoint([])).toBeNull();
    expect(polygonToPath([])).toBe('');
  });

  it('builds transformed closed path fragments', () => {
    const rotated = rotatePoint({ x: 1, y: 0 }, Math.PI / 2);
    const translated = translatePoint({ x: 1, y: 2 }, { x: 3, y: 4 });

    expect(Math.round(rotated.x)).toBe(0);
    expect(Math.round(rotated.y)).toBe(1);
    expect(translated).toEqual({ x: 4, y: 6 });
    expect(
      polygonToPath([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ])
    ).toBe('M 0 0 L 1 0 Z');
    expect(circleToPath({ x: 4, y: 5 }, 3)).toContain('A 3 3');
  });
});
