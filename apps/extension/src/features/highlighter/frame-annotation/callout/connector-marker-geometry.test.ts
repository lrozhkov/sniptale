import { describe, expect, it } from 'vitest';
import { getConnectorEndpointGeometry } from './connector-marker-geometry';

describe('connector endpoint marker geometry', () => {
  it('keeps a ring-dot center exactly on the visual boundary', () => {
    const geometry = getConnectorEndpointGeometry({
      adjacentPoint: { x: 40, y: 40 },
      boundaryWidth: 6,
      contactPoint: { x: 20, y: 20 },
      endpoint: 'start',
      lineWidth: 2,
      marker: 'ring-dot',
      markerSize: 14,
    });

    expect(geometry.markerPoint).toEqual({ x: 20, y: 20 });
    expect(Math.hypot(geometry.linePoint.x - 20, geometry.linePoint.y - 20)).toBeCloseTo(7);
  });

  it.each([
    { marker: 'circle' as const, linePoint: { x: 20 + 3 * Math.SQRT2, y: 20 + 3 * Math.SQRT2 } },
    { marker: 'square' as const, linePoint: { x: 26, y: 26 } },
    { marker: 'diamond' as const, linePoint: { x: 23, y: 23 } },
  ])('centers $marker on the boundary and joins a diagonal line at its contour', (fixture) => {
    const geometry = getConnectorEndpointGeometry({
      adjacentPoint: { x: 40, y: 40 },
      boundaryWidth: 6,
      contactPoint: { x: 20, y: 20 },
      endpoint: 'start',
      lineWidth: 2,
      marker: fixture.marker,
      markerSize: 12,
    });

    expect(geometry.markerPoint).toEqual({ x: 20, y: 20 });
    expect(geometry.tipPoint).toEqual({ x: 20, y: 20 });
    expect(geometry.linePoint.x).toBeCloseTo(fixture.linePoint.x);
    expect(geometry.linePoint.y).toBeCloseTo(fixture.linePoint.y);
  });

  it('stops an arrow tip before the frame outer contour and points toward it', () => {
    const geometry = getConnectorEndpointGeometry({
      adjacentPoint: { x: 40, y: 20 },
      boundaryWidth: 8,
      contactPoint: { x: 60, y: 20 },
      endpoint: 'end',
      lineWidth: 4,
      marker: 'arrow',
      markerSize: 16,
    });

    expect(geometry.tipPoint.x).toBeLessThan(60);
    expect(geometry.markerPoint.x).toBeLessThan(geometry.tipPoint.x);
    expect(geometry.linePoint.x).toBeLessThan(geometry.markerPoint.x);
    expect(geometry.angle).toBeCloseTo(0);
  });
});
