import { expect, it } from 'vitest';
import {
  createMotionPathAreaTarget,
  createMotionPathPointTarget,
  resolveMotionPathStopFocusArea,
  resolveMotionPathStopFocusPoint,
  resolveMotionPathStopScale,
} from './path-targets';

const project = { height: 600, width: 800 };

it('clamps point targets into the project bounds and supported scale range', () => {
  expect(createMotionPathPointTarget(project, { x: -50, y: 999 }, 9)).toEqual({
    kind: 'POINT',
    scale: 4,
    x: 0,
    y: 600,
  });
});

it('clamps area targets into the project bounds and minimum size', () => {
  expect(
    createMotionPathAreaTarget(project, {
      height: 20,
      width: 1200,
      x: -25,
      y: 999,
    })
  ).toEqual({
    height: 48,
    kind: 'AREA',
    width: 800,
    x: 0,
    y: 552,
  });
});

it('falls back to the full frame when the area target is missing', () => {
  expect(createMotionPathAreaTarget(project, null as never)).toEqual({
    height: 600,
    kind: 'AREA',
    width: 800,
    x: 0,
    y: 0,
  });
});

it('derives a focus area from a point stop scale near the project edge', () => {
  expect(
    resolveMotionPathStopFocusArea(project, {
      id: 'stop-1',
      offset: 0,
      target: { kind: 'POINT', scale: 2, x: 760, y: 560 },
    })
  ).toEqual({
    height: 300,
    width: 400,
    x: 400,
    y: 300,
  });
});

it('defaults invalid point targets back to the project center and base scale', () => {
  expect(
    createMotionPathPointTarget(project, { x: Number.NaN, y: Number.POSITIVE_INFINITY }, Number.NaN)
  ).toEqual({
    kind: 'POINT',
    scale: 1,
    x: 400,
    y: 300,
  });
  expect(
    resolveMotionPathStopScale(project, {
      id: 'area',
      offset: 0,
      target: { height: 600, kind: 'AREA', width: 800, x: 0, y: 0 },
    })
  ).toBe(1);
});

it('derives focus point and scale from an area stop', () => {
  const stop = {
    id: 'stop-2',
    offset: 1,
    target: { height: 150, kind: 'AREA', width: 200, x: 300, y: 180 },
  } as const;

  expect(resolveMotionPathStopFocusPoint(project, stop)).toEqual({ x: 400, y: 255 });
  expect(resolveMotionPathStopScale(project, stop)).toBe(4);
});

it('normalizes focus point from a point stop', () => {
  expect(
    resolveMotionPathStopFocusPoint(project, {
      id: 'stop-point',
      offset: 0,
      target: { kind: 'POINT', scale: 1.5, x: -10, y: 620 },
    })
  ).toEqual({ x: 0, y: 600 });
});
