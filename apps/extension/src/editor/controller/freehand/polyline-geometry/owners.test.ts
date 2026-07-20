import { describe, expect, it } from 'vitest';
import { measureSignedPolygonArea } from './area';
import { measurePolylineError } from './error';
import { measureProgressRatios } from './progress';
import { samplePolylineAtProgress } from './sample';

describe('freehand polyline geometry role owners', () => {
  it('keeps progress and sampling roles separate', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];

    expect(measureProgressRatios(points)).toEqual([0, 0.5, 1]);
    expect(samplePolylineAtProgress(points, 0.75)).toEqual({ x: 10, y: 5 });
    expect(samplePolylineAtProgress([{ x: 2, y: 3 }], 0.5)).toEqual({ x: 2, y: 3 });
  });

  it('keeps polygon area and outline error roles separate', () => {
    const outline = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ];

    expect(measureSignedPolygonArea(outline.slice(0, -1))).toBeGreaterThan(0);
    expect(measurePolylineError([{ x: 5, y: 0 }], outline)).toBe(0);
    expect(
      measurePolylineError(
        [{ x: 2, y: 2 }],
        [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ]
      )
    ).toBe(Math.sqrt(8));
  });
});
