import { describe, expect, it } from 'vitest';
import {
  buildDiamondVertices,
  buildRectangleVertices,
  measureCentroid,
  measureOrientedBounds,
  measurePrincipalAxis,
  orderVerticesClockwise,
  rotatePoint,
} from './oriented-geometry';

describe('editor-controller freehand oriented geometry owner', () => {
  it('measures rotated bounds and principal axis', () => {
    const center = { x: 20, y: 12 };
    const rectangle = buildRectangleVertices({
      center,
      height: 16,
      rotation: Math.PI / 6,
      width: 30,
    });

    expect(measureCentroid(rectangle)).toEqual(center);
    expect(measurePrincipalAxis(rectangle)).toBeCloseTo(Math.PI / 6, 1);
    expect(measureOrientedBounds(rectangle, center, Math.PI / 6)).toEqual(
      expect.objectContaining({
        height: expect.closeTo(16, 6),
        left: expect.closeTo(5, 6),
        width: expect.closeTo(30, 6),
      })
    );
  });

  it('builds oriented vertices and sorts them around their centroid', () => {
    expect(rotatePoint({ x: 4, y: 2 }, { x: 2, y: 2 }, Math.PI / 2)).toEqual({
      x: 2,
      y: 4,
    });
    expect(
      orderVerticesClockwise([
        { x: 10, y: 0 },
        { x: 20, y: 10 },
        { x: 0, y: 10 },
        { x: 10, y: 20 },
      ])
    ).toHaveLength(4);
    expect(
      buildDiamondVertices({
        center: { x: 10, y: 10 },
        height: 20,
        rotation: Math.PI / 4,
        width: 20,
      })
    ).toHaveLength(4);
  });
});
