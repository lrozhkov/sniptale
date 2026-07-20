import { describe, expect, it } from 'vitest';

import { buildRoundedClosedPath } from './rounded-path';

function registerTooSmallPolygonTest() {
  it('returns an empty path for polygons with fewer than three points', () => {
    expect(
      buildRoundedClosedPath(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        {
          radius: 4,
          roundedIndexes: new Set([1]),
        }
      )
    ).toBe('');
  });
}

function registerPlainClosedPathTest() {
  it('builds a plain closed path when no rounded indexes are requested', () => {
    const path = buildRoundedClosedPath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      {
        radius: 4,
        roundedIndexes: new Set<number>(),
      }
    );

    expect(path).toContain('M 0 0');
    expect(path).not.toContain('Q');
    expect(path).toContain('Z');
  });
}

function registerRoundedIndexesTest() {
  it('adds quadratic corners for rounded indexes and survives zero-length adjacent edges', () => {
    const path = buildRoundedClosedPath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 0 },
        { x: 16, y: 8 },
        { x: 0, y: 8 },
      ],
      {
        radius: 5,
        roundedIndexes: new Set([1, 3]),
      }
    );

    expect(path).toContain('Q');
    expect(path).toContain('Z');
  });
}

function registerPerCornerRadiusTest() {
  it('supports per-corner radius maps without rounding untouched vertices', () => {
    const path = buildRoundedClosedPath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      {
        cornerRadii: new Map([
          [1, 2],
          [2, 3],
        ]),
      }
    );

    expect(path.split('Q')).toHaveLength(3);
    expect(path).toContain('Z');
  });
}

describe('arrow visual rounded path', () => {
  registerTooSmallPolygonTest();
  registerPlainClosedPathTest();
  registerRoundedIndexesTest();
  registerPerCornerRadiusTest();
});
