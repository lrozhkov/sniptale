import { describe, expect, it } from 'vitest';
import {
  measurePolylineError,
  measureProgressRatios,
  measureSignedPolygonArea,
  samplePolylineAtProgress,
} from './polyline-geometry';

describe('editor-controller freehand polyline geometry owner', () => {
  it('measures progress ratios and samples by traversed length', () => {
    const polyline = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];

    expect(measureProgressRatios([])).toEqual([]);
    expect(measureProgressRatios(polyline)).toEqual([0, 0.5, 1]);
    expect(samplePolylineAtProgress([], 0.5)).toEqual({ x: 0, y: 0 });
    expect(samplePolylineAtProgress([{ x: 2, y: 3 }], 0.5)).toEqual({ x: 2, y: 3 });
    expect(samplePolylineAtProgress(polyline, 0.75)).toEqual({ x: 10, y: 5 });
    expect(samplePolylineAtProgress(polyline, 1.5)).toEqual({ x: 10, y: 10 });
  });

  it('measures polygon area and average outline error', () => {
    const outline = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ];

    expect(measureSignedPolygonArea(outline.slice(0, -1))).toBeGreaterThan(0);
    expect(
      measureSignedPolygonArea([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ])
    ).toBe(0);
    expect(measurePolylineError([], outline)).toBe(Number.POSITIVE_INFINITY);
    expect(
      measurePolylineError(
        [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
          { x: 10, y: 0 },
        ],
        outline
      )
    ).toBe(0);
  });
});
