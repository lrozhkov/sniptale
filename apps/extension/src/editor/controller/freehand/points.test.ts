import { describe, expect, it, vi } from 'vitest';

vi.mock('fabric', () => ({
  Path: class Path {
    constructor(public path: Array<Array<string | number>>) {}
  },
}));

import { Path } from 'fabric';
import {
  isFreehandPointRecord,
  parseFreehandPointsJson,
  recoverFreehandPointsFromPath,
  serializeFreehandPoints,
} from './points';

function runFreehandPointsSuite() {
  it('serializes and parses valid freehand points', () => {
    const points = [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ];

    expect(parseFreehandPointsJson(serializeFreehandPoints(points))).toEqual(points);
    expect(parseFreehandPointsJson('[{"x":1,"y":2},{"x":"bad","y":2},{"x":3,"y":4}]')).toEqual(
      points
    );
  });

  it('rejects empty and malformed point payloads', () => {
    expect(isFreehandPointRecord({ x: 1, y: 2 })).toBe(true);
    expect(isFreehandPointRecord({ x: 1, y: Number.NaN })).toBe(false);
    expect(parseFreehandPointsJson('')).toBeNull();
    expect(parseFreehandPointsJson('{"x":1}')).toBeNull();
    expect(parseFreehandPointsJson('[{"x":"bad","y":2}]')).toBeNull();
    expect(parseFreehandPointsJson('not-json')).toBeNull();
  });

  it('recovers unique points from Fabric path commands', () => {
    const path = new Path([
      ['M', 0, 0],
      ['Q', 5, 5, 10, 10],
      ['L', 10, 10],
      ['L', 12, 12],
      ['L', 'bad', 30],
    ] as never);

    expect(recoverFreehandPointsFromPath(path)).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 10 },
      { x: 12, y: 12 },
    ]);
    expect(recoverFreehandPointsFromPath({})).toBeNull();
  });
}

describe('editor-controller freehand points seam', runFreehandPointsSuite);
