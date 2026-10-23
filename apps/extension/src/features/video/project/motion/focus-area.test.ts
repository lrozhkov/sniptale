import { expect, it } from 'vitest';

import {
  getProjectCenter,
  normalizeMotionFocusArea,
  normalizeMotionPoint,
  isMotionFocusArea,
  motionFocusAreaPoint,
  motionFocusAreaBounds,
  resizeOrientedMotionArea,
} from './focus-area';

it('normalizes motion focus area and points for motion owners', () => {
  const project = { height: 720, width: 1280 };

  expect(getProjectCenter(project)).toEqual({ x: 640, y: 360 });
  expect(normalizeMotionPoint(project, Number.NaN, 900)).toEqual({ x: 640, y: 720 });
  expect(normalizeMotionFocusArea(project, null)).toBeNull();
  expect(
    normalizeMotionFocusArea(project, {
      height: Number.NaN,
      width: 40,
      x: -20,
      y: 800,
    })
  ).toEqual({
    height: 48,
    width: 48,
    x: 0,
    y: 672,
  });
});

it('keeps a converted nonorthogonal area and its opposite corner while resizing', () => {
  const area = {
    x: -20,
    y: 30,
    width: 100,
    height: 80,
    axes: { x: { x: 1, y: 0 }, y: { x: 0.6, y: 0.8 } },
  };
  expect(isMotionFocusArea(area)).toBe(true);
  expect(normalizeMotionFocusArea({ width: 80, height: 60 }, area)).toEqual(area);
  expect(motionFocusAreaBounds(area)).toEqual({ x: -20, y: 30, width: 148, height: 64 });
  expect(motionFocusAreaPoint(area, 0.5, 0.5)).toEqual({ x: 54, y: 62 });
  const resized = resizeOrientedMotionArea(area, 'nw', { x: 10, y: 8 });
  expect(resized).toEqual({
    ...area,
    x: expect.closeTo(-10, 8),
    y: expect.closeTo(38, 8),
    width: expect.closeTo(96, 8),
    height: expect.closeTo(70, 8),
  });
  const opposite = motionFocusAreaPoint(area, 1, 1),
    actual = motionFocusAreaPoint(resized, 1, 1);
  expect(actual.x).toBeCloseTo(opposite.x, 8);
  expect(actual.y).toBeCloseTo(opposite.y, 8);
});

it('refuses singular, nonunit, incomplete and nonfinite area directions', () => {
  const area = { x: 0, y: 0, width: 100, height: 100 };
  for (const axes of [
    null,
    {},
    { x: { x: 1, y: 0 }, y: { x: 1, y: 0 } },
    { x: { x: 2, y: 0 }, y: { x: 0, y: 1 } },
    { x: { x: NaN, y: 0 }, y: { x: 0, y: 1 } },
    { x: { x: 1, y: 0, z: 0 }, y: { x: 0, y: 1 } },
  ])
    expect(isMotionFocusArea({ ...area, axes })).toBe(false);
});

it('lets a converted small area grow and return to its previous physical dimensions', () => {
  const area = {
    x: 20,
    y: 30,
    width: 20,
    height: 10,
    axes: { x: { x: 1, y: 0 }, y: { x: 0, y: 1 } },
  };
  const larger = resizeOrientedMotionArea(area, 'se', { x: 5, y: 5 });
  expect(larger).toEqual({ ...area, width: 25, height: 15 });
  expect(resizeOrientedMotionArea(larger, 'se', { x: -5, y: -5 })).toEqual(area);
});
