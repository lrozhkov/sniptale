import { describe, expect, it } from 'vitest';

import { buildRoundedClosedPath } from './build';
import { getPointDistance, moveTowardPoint } from './geometry';

describe('arrow rounded path role owners', () => {
  it('builds closed paths through corner resolution, geometry, and formatting owners', () => {
    const path = buildRoundedClosedPath(
      [
        { x: 0, y: 0 },
        { x: 10.12345, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      {
        cornerRadii: new Map([[1, 3]]),
        radius: 5,
        roundedIndexes: new Set([2]),
      }
    );

    expect(path).toContain('M 0 0');
    expect(path).toContain('Q 10.123 0');
    expect(path.split('Q')).toHaveLength(3);
    expect(path.endsWith(' Z')).toBe(true);
  });

  it('keeps point distance and zero-length movement in the geometry owner', () => {
    expect(getPointDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(moveTowardPoint({ x: 2, y: 3 }, { x: 2, y: 3 }, 10)).toEqual({ x: 2, y: 3 });
  });
});
