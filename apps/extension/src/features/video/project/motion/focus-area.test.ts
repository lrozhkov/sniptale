import { expect, it } from 'vitest';

import { getProjectCenter, normalizeMotionFocusArea, normalizeMotionPoint } from './focus-area';

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
