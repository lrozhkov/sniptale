import { describe, expect, it } from 'vitest';

import {
  buildPolylineLengthState,
  getPolylineSample,
  getSmoothedPolylineSample,
} from './tapered-polyline';

function registerLengthStateTest() {
  it('tracks cumulative segment lengths across the centerline', () => {
    expect(
      buildPolylineLengthState([
        { x: 0, y: 0 },
        { x: 3, y: 4 },
        { x: 6, y: 4 },
      ])
    ).toEqual({
      distances: [0, 5, 8],
      total: 8,
    });
  });
}

function registerSparseLengthStateTest() {
  it('skips sparse polyline holes instead of inferring distances through missing points', () => {
    const sparsePoints = [{ x: 0, y: 0 }, undefined, { x: 6, y: 8 }] as unknown as {
      x: number;
      y: number;
    }[];

    expect(buildPolylineLengthState(sparsePoints)).toEqual({
      distances: [0],
      total: 0,
    });
  });
}

function registerSamplingTest() {
  it('samples a point and local normal from the requested centerline distance', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    const lengthState = buildPolylineLengthState(points);

    expect(getPolylineSample(points, lengthState, 4)).toEqual({
      normal: { x: -0, y: 1 },
      point: { x: 4, y: 0 },
    });
    expect(getPolylineSample(points, lengthState, 12)).toEqual({
      normal: { x: -1, y: 0 },
      point: { x: 10, y: 2 },
    });
    expect(getPolylineSample(points, lengthState, 200).point).toEqual({ x: 10, y: 10 });
  });
}

function registerDegenerateClampTest() {
  it('clamps sampling distances and resolves zero-length segments to a default normal', () => {
    const degeneratePoints = [
      { x: 3, y: 4 },
      { x: 3, y: 4 },
    ];
    const lengthState = buildPolylineLengthState(degeneratePoints);

    expect(getPolylineSample(degeneratePoints, lengthState, -10)).toEqual({
      normal: { x: -0, y: 1 },
      point: { x: 3, y: 4 },
    });
    expect(getPolylineSample(degeneratePoints, lengthState, 10)).toEqual({
      normal: { x: -0, y: 1 },
      point: { x: 3, y: 4 },
    });
  });
}

function registerFallbackShapeTest() {
  it('falls back safely when the polyline has only one or zero points', () => {
    const singlePoint = [{ x: 7, y: 9 }];
    const singlePointLengthState = buildPolylineLengthState(singlePoint);
    const emptyLengthState = buildPolylineLengthState([]);

    expect(getPolylineSample(singlePoint, singlePointLengthState, 4)).toEqual({
      normal: { x: -0, y: 1 },
      point: { x: 7, y: 9 },
    });
    expect(getPolylineSample([], emptyLengthState, 4)).toEqual({
      normal: { x: -0, y: 1 },
      point: { x: 0, y: 0 },
    });
  });
}

function registerSmoothedSamplingTest() {
  it('builds a smoothed tangent frame across bend points for tapered shaft offsets', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    const lengthState = buildPolylineLengthState(points);
    const frame = getSmoothedPolylineSample(points, lengthState, 10);

    expect(frame.point).toEqual({ x: 10, y: 0 });
    expect(frame.tangent.x).toBeCloseTo(Math.SQRT1_2, 5);
    expect(frame.tangent.y).toBeCloseTo(Math.SQRT1_2, 5);
    expect(frame.normal.x).toBeCloseTo(-Math.SQRT1_2, 5);
    expect(frame.normal.y).toBeCloseTo(Math.SQRT1_2, 5);
  });
}

function registerSmoothedReversalTest() {
  it('falls back to the outgoing segment when opposing tangents cancel at a reversal vertex', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 0 },
    ];
    const lengthState = buildPolylineLengthState(points);
    const frame = getSmoothedPolylineSample(points, lengthState, 10);

    expect(frame.point).toEqual({ x: 10, y: 0 });
    expect(frame.tangent).toEqual({ x: -1, y: 0 });
    expect(frame.normal).toEqual({ x: -0, y: -1 });
  });
}

function registerSmoothedDegenerateFallbackTest() {
  it('falls back safely for smoothed samples on degenerate centerlines', () => {
    const points = [
      { x: 3, y: 4 },
      { x: 3, y: 4 },
    ];
    const lengthState = buildPolylineLengthState(points);
    const frame = getSmoothedPolylineSample(points, lengthState, 5);

    expect(frame.point).toEqual({ x: 3, y: 4 });
    expect(frame.tangent).toEqual({ x: 1, y: 0 });
    expect(frame.normal).toEqual({ x: -0, y: 1 });
  });
}

function registerSmoothedClampTest() {
  it('clamps smoothed samples to the available polyline range', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    const lengthState = buildPolylineLengthState(points);

    expect(getSmoothedPolylineSample(points, lengthState, -5).point).toEqual({ x: 0, y: 0 });
    expect(getSmoothedPolylineSample(points, lengthState, 30).point).toEqual({ x: 10, y: 10 });
  });
}

function registerSmoothedEndpointTangentTest() {
  it('keeps endpoint tangents aligned with the terminal segment in every direction', () => {
    const vertical = [
      { x: 0, y: 0 },
      { x: 0, y: -120 },
    ];
    const diagonal = [
      { x: 0, y: 0 },
      { x: -90, y: 90 },
    ];
    const verticalFrame = getSmoothedPolylineSample(
      vertical,
      buildPolylineLengthState(vertical),
      120
    );
    const diagonalFrame = getSmoothedPolylineSample(
      diagonal,
      buildPolylineLengthState(diagonal),
      Math.hypot(90, 90)
    );

    expect(verticalFrame.tangent.x).toBeCloseTo(0, 5);
    expect(verticalFrame.tangent.y).toBeCloseTo(-1, 5);
    expect(diagonalFrame.tangent.x).toBeCloseTo(-Math.SQRT1_2, 5);
    expect(diagonalFrame.tangent.y).toBeCloseTo(Math.SQRT1_2, 5);
  });
}

function runTaperedPolylineSuite() {
  registerLengthStateTest();
  registerSparseLengthStateTest();
  registerSamplingTest();
  registerDegenerateClampTest();
  registerFallbackShapeTest();
  registerSmoothedSamplingTest();
  registerSmoothedReversalTest();
  registerSmoothedDegenerateFallbackTest();
  registerSmoothedClampTest();
  registerSmoothedEndpointTangentTest();
}

describe('arrow visual tapered polyline helpers', runTaperedPolylineSuite);
