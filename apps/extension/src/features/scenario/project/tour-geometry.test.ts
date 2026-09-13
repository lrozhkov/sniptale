import { expect, it } from 'vitest';
import { mapTourCapturePoint, mapTourCaptureRect } from './tour-geometry';

it('normalizes explicit visible, scrolled-full, selection and iframe coordinate spaces', () => {
  for (const sourceRect of [
    { x: 0, y: 0, width: 800, height: 600 },
    { x: 0, y: -1200, width: 800, height: 2400 },
    { x: 100, y: 200, width: 300, height: 100 },
    { x: 400, y: 250, width: 200, height: 150 },
  ]) {
    expect(
      mapTourCapturePoint(
        { x: sourceRect.x + sourceRect.width / 4, y: sourceRect.y + sourceRect.height / 2 },
        { sourceRect, rotation: 0 }
      )
    ).toEqual({ x: 0.25, y: 0.5 });
  }
});
it('rotates points and intersected rectangles through the same normalized transform', () => {
  const sourceRect = { x: 10, y: 20, width: 100, height: 200 };
  for (const [rotation, expected] of [
    [0, { x: 0.25, y: 0.5 }],
    [90, { x: 0.5, y: 0.25 }],
    [180, { x: 0.75, y: 0.5 }],
    [270, { x: 0.5, y: 0.75 }],
  ] as const)
    expect(mapTourCapturePoint({ x: 35, y: 120 }, { sourceRect, rotation })).toEqual(expected);
  expect(
    mapTourCaptureRect({ x: -10, y: 20, width: 70, height: 100 }, { sourceRect, rotation: 90 })
  ).toEqual({ x: 0.5, y: 0, width: 0.5, height: 0.5 });
});
it('does not invent a point from missing, outside or malformed evidence', () => {
  const mapping = { sourceRect: { x: 0, y: 0, width: 100, height: 100 }, rotation: 0 } as const;
  for (const point of [null, { x: -1, y: 0 }, { x: Infinity, y: 50 }, { x: 101, y: 20 }])
    expect(mapTourCapturePoint(point, mapping)).toBeNull();
  expect(
    mapTourCapturePoint(
      { x: 0, y: 0 },
      { ...mapping, sourceRect: { ...mapping.sourceRect, width: 0 } }
    )
  ).toBeNull();
  expect(mapTourCaptureRect(null, mapping)).toBeNull();
  expect(mapTourCaptureRect({ x: 200, y: 200, width: 20, height: 20 }, mapping)).toBeNull();
  expect(mapTourCaptureRect({ x: 0, y: 0, width: -1, height: 20 }, mapping)).toBeNull();
});
