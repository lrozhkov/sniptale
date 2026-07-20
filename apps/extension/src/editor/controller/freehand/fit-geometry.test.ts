import { describe, expect, it } from 'vitest';
import {
  buildDiamondVertices,
  buildRectangleVertices,
  measureCentroid,
  measureOrientedBounds,
  measurePolylineError,
  measurePrincipalAxis,
  measureProgressRatios,
  measureSignedPolygonArea,
  orderVerticesClockwise,
  rotatePoint,
  samplePolylineAtProgress,
} from './fit-geometry';

function registerOrientedBoundsTest() {
  it('covers centroid, rotation, and oriented bounds for rotated points', () => {
    const center = { x: 20, y: 12 };
    const rectangle = buildRectangleVertices({
      center,
      height: 16,
      rotation: Math.PI / 6,
      width: 30,
    });

    expect(measureCentroid(rectangle)).toEqual(center);
    expect(measurePrincipalAxis(rectangle)).toBeCloseTo(Math.PI / 6, 1);
    const bounds = measureOrientedBounds(rectangle, center, Math.PI / 6);
    expect(bounds.width).toBeCloseTo(30, 6);
    expect(bounds.height).toBeCloseTo(16, 6);
    expect(bounds.left).toBeCloseTo(5, 6);
  });
}

function registerVertexOrderingTest() {
  it('orders vertices clockwise and builds diamond vertices', () => {
    const vertices = orderVerticesClockwise([
      { x: 10, y: 0 },
      { x: 20, y: 10 },
      { x: 0, y: 10 },
      { x: 10, y: 20 },
    ]);
    const diamond = buildDiamondVertices({
      center: { x: 10, y: 10 },
      height: 20,
      rotation: Math.PI / 4,
      width: 20,
    });

    expect(vertices).toHaveLength(4);
    expect(diamond).toHaveLength(4);
  });
}

function registerProgressEdgeCasesTest() {
  it('handles empty, single-point, and degenerate progress sampling', () => {
    expect(measureProgressRatios([])).toEqual([]);
    expect(samplePolylineAtProgress([], 0.5)).toEqual({ x: 0, y: 0 });
    expect(samplePolylineAtProgress([{ x: 2, y: 3 }], 0.5)).toEqual({ x: 2, y: 3 });
    expect(
      measureProgressRatios([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ])
    ).toEqual([0, 0, 1]);
  });
}

function registerProgressSamplingTest() {
  it('samples polyline progress along the traversed path', () => {
    const polyline = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];

    expect(samplePolylineAtProgress(polyline, 0.25)).toEqual({ x: 5, y: 0 });
    expect(samplePolylineAtProgress(polyline, 0.75)).toEqual({ x: 10, y: 5 });
    expect(samplePolylineAtProgress(polyline, 1.5)).toEqual({ x: 10, y: 10 });
  });
}

function registerRotationTest() {
  it('rotates points around an arbitrary center', () => {
    expect(rotatePoint({ x: 4, y: 2 }, { x: 2, y: 2 }, Math.PI / 2)).toEqual({
      x: 2,
      y: 4,
    });
  });
}

function registerPolylineMetricsTest() {
  it('measures signed polygon area and outline error for fitted paths', () => {
    const outline = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ];

    expect(measureSignedPolygonArea(outline.slice(0, -1))).toBeGreaterThan(0);
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
}

describe('editor-controller freehand fit-geometry seam', () => {
  registerOrientedBoundsTest();
  registerVertexOrderingTest();
  registerProgressEdgeCasesTest();
  registerProgressSamplingTest();
  registerRotationTest();
  registerPolylineMetricsTest();
});
