import { describe, expect, it } from 'vitest';

import { buildPolylineLengthState } from './length-state';
import { getPolylineSample, getSmoothedPolylineSample } from './sample';
import { interpolatePoint, resolvePolylineSegment } from './segment';
import { addVectors, normalizeVector } from './vectors';

describe('arrow visual tapered polyline role owners', () => {
  it('keeps length and segment resolution bounded to the centerline distance model', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    const lengthState = buildPolylineLengthState(points);

    expect(lengthState).toEqual({ distances: [0, 10, 20], total: 20 });
    expect(resolvePolylineSegment(points, lengthState, 12)).toEqual(
      expect.objectContaining({
        ratio: 0.2,
        start: { x: 10, y: 0 },
        end: { x: 10, y: 10 },
      })
    );
    expect(interpolatePoint({ x: 10, y: 0 }, { x: 10, y: 10 }, 0.2)).toEqual({
      x: 10,
      y: 2,
    });
  });

  it('keeps vector fallback and smoothed sample roles separate from length accumulation', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
    const lengthState = buildPolylineLengthState(points);

    expect(normalizeVector({ x: 0, y: 0 })).toEqual({ x: 1, y: 0 });
    expect(addVectors({ x: 1, y: 2 }, { x: -3, y: 4 })).toEqual({ x: -2, y: 6 });
    expect(getPolylineSample(points, lengthState, 5)).toEqual({
      normal: { x: -0, y: 1 },
      point: { x: 0, y: 0 },
    });
    expect(getSmoothedPolylineSample(points, lengthState, 5)).toEqual({
      normal: { x: -0, y: 1 },
      point: { x: 0, y: 0 },
      tangent: { x: 1, y: 0 },
    });
  });
});
