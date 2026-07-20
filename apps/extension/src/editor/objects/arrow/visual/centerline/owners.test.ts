import { expect, it } from 'vitest';
import { getArrowCenterlineAngle, getFirstNonZeroEdgeAngle } from './angles';
import { buildArrowCenterline } from './build';
import { buildArrowCurveSegments, sampleArrowCurve, sampleCubicPoint } from './curve';
import { buildEmptyCenterline } from './empty';

it('keeps centerline terminal angle resolution in the angles owner', () => {
  expect(getArrowCenterlineAngle({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(Math.PI / 2);
  expect(
    getFirstNonZeroEdgeAngle(
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      false
    )
  ).toBeCloseTo(0);
});

it('keeps curve segment and cubic sampling in the curve owner', () => {
  const [segment] = buildArrowCurveSegments([
    { x: 0, y: 0 },
    { x: 60, y: 0 },
    { x: 120, y: 60 },
  ]);

  expect(segment?.end).toEqual({ x: 60, y: 0 });
  expect(sampleCubicPoint({ x: 0, y: 0 }, segment!, 1)).toEqual({ x: 60, y: 0 });
  expect(buildArrowCurveSegments([undefined, { x: 1, y: 1 }] as never)).toEqual([]);
  expect(sampleArrowCurve([])).toEqual([]);
});

it('keeps collapsed centerline fallback in the empty owner', () => {
  expect(buildEmptyCenterline()).toEqual({
    endAngle: 0,
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ],
    startAngle: 0,
  });
  expect(
    buildArrowCenterline([], {
      color: '#000000',
      endHead: 'none',
      mode: 'straight',
      opacity: 1,
      shadow: 0,
      startHead: 'none',
      variant: 'standard',
      width: 2,
    })
  ).toEqual(buildEmptyCenterline());
});

it('keeps non-empty centerline assembly in the build owner', () => {
  expect(
    buildArrowCenterline(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      {
        color: '#000000',
        endHead: 'none',
        mode: 'straight',
        opacity: 1,
        shadow: 0,
        startHead: 'none',
        variant: 'standard',
        width: 2,
      }
    )
  ).toEqual({
    endAngle: 0,
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
    startAngle: 0,
  });
});

it('keeps curved centerline assembly in the build owner', () => {
  const centerline = buildArrowCenterline(
    [
      { x: 0, y: 0 },
      { x: 10, y: 20 },
      { x: 20, y: 0 },
    ],
    {
      color: '#000000',
      endHead: 'none',
      mode: 'curve',
      opacity: 1,
      shadow: 0,
      startHead: 'none',
      variant: 'standard',
      width: 2,
    }
  );

  expect(centerline.points.length).toBeGreaterThan(3);
  expect(centerline.points.at(0)).toEqual({ x: 0, y: 0 });
  expect(centerline.points.at(-1)).toEqual({ x: 20, y: 0 });
});
