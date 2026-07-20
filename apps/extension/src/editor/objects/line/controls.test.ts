// @vitest-environment jsdom

import { Point, util } from 'fabric';
import { expect, it } from 'vitest';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import { getSketchPolylineSegmentPoint } from '../sketch-path/sampling';
import { createLineObject, setLineEditMode } from './';
import { getLineSegmentMidpoint, preserveLineAnchorPosition } from './control-geometry';
import { LINE_ROUGH_SEED } from './rough';

const settings = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET).line;

function toViewportPoint(
  line: ReturnType<typeof createLineObject>,
  point: { x: number; y: number }
): Point {
  return new Point(point.x - line.pathOffset.x, point.y - line.pathOffset.y).transform(
    util.multiplyTransformMatrices(line.getViewportTransform(), line.calcTransformMatrix())
  );
}

it('places closed rough midpoint controls on the rendered bowed segment', () => {
  const line = createLineObject({
    id: 'line-closed-bowed-midpoint',
    labelIndex: 1,
    points: [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 0, y: 80 },
    ],
    settings: { ...settings, bowing: 8, roughness: 0, width: 24 },
    closed: true,
  });
  setLineEditMode(line, true);

  const midpointControl = line.controls['m0'];
  expect(midpointControl).toBeDefined();
  const position = midpointControl?.positionHandler(
    new Point(0, 0),
    line.calcTransformMatrix(),
    line,
    midpointControl
  );
  const expected = toViewportPoint(
    line,
    getSketchPolylineSegmentPoint(
      line.sniptaleLinePoints[0]!,
      line.sniptaleLinePoints[1]!,
      {
        bowing: 8,
        roughness: 0,
        seed: LINE_ROUGH_SEED,
        strokeWidth: 24,
      },
      0,
      0.5
    )
  );

  expect(position?.x).toBeCloseTo(expected.x);
  expect(position?.y).toBeCloseTo(expected.y);
});

it('moves point controls while preserving the opposite anchor', () => {
  const line = createLineObject({
    id: 'line-point-control',
    labelIndex: 1,
    points: [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 60 },
    ],
    settings,
  });

  setLineEditMode(line, true);
  const pointControl = line.controls['p1'];
  const moved = pointControl?.actionHandler?.({} as never, { target: line } as never, 90, 10);

  expect(moved).toBe(true);
  expect(line.sniptaleLinePoints[1]).toEqual({ x: 90, y: 10 });
  expect(line.left).toBeCloseTo(line.pathOffset.x);
  expect(line.top).toBeCloseTo(line.pathOffset.y);
});

it('inserts and then moves midpoint controls during one drag session', () => {
  const line = createLineObject({
    id: 'line-midpoint-control',
    labelIndex: 1,
    points: [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
    ],
    settings,
  });

  setLineEditMode(line, true);
  const midpointControl = line.controls['m0'];

  expect(midpointControl?.actionHandler?.({} as never, { target: line } as never, 40, 20)).toBe(
    true
  );
  expect(line.sniptaleLinePoints).toEqual([
    { x: 0, y: 0 },
    { x: 40, y: 20 },
    { x: 80, y: 0 },
  ]);

  expect(midpointControl?.actionHandler?.({} as never, { target: line } as never, 50, 30)).toBe(
    true
  );
  expect(line.sniptaleLinePoints).toEqual([
    { x: 0, y: 0 },
    { x: 50, y: 30 },
    { x: 80, y: 0 },
  ]);
});

it('ignores non-line targets and missing line segments', () => {
  const line = createLineObject({
    id: 'line-invalid-control-target',
    labelIndex: 1,
    points: [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
    ],
    settings,
  });

  setLineEditMode(line, true);
  const pointControl = line.controls['p0'];
  const midpointControl = line.controls['m0'];
  if (!pointControl || !midpointControl) {
    throw new Error('Expected line edit controls');
  }
  const invalidTarget = {} as unknown as Parameters<
    NonNullable<typeof pointControl.actionHandler>
  >[1];
  const invalidLine = {} as unknown as typeof line;

  expect(pointControl.actionHandler?.({} as never, invalidTarget, 1, 2)).toBe(false);
  expect(midpointControl.actionHandler?.({} as never, invalidTarget, 1, 2)).toBe(false);
  expect(
    pointControl?.positionHandler(
      new Point(0, 0),
      line.calcTransformMatrix(),
      invalidLine,
      pointControl
    )
  ).toEqual(new Point(0, 0));
  expect(
    midpointControl?.positionHandler(
      new Point(0, 0),
      line.calcTransformMatrix(),
      invalidLine,
      midpointControl
    )
  ).toEqual(new Point(0, 0));

  const linePoints = line.sniptaleLinePoints;
  line.sniptaleLinePoints = [];
  expect(getLineSegmentMidpoint(line, 0)).toBeNull();
  preserveLineAnchorPosition(line, 0, new Point(0, 0));
  line.sniptaleLinePoints = linePoints;
});

it('covers midpoint wrapping and anchor fallback geometry', () => {
  const line = createLineObject({
    id: 'line-control-geometry-branches',
    labelIndex: 1,
    points: [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
    ],
    settings,
    closed: true,
  });

  expect(getLineSegmentMidpoint(line, 1)).toEqual({ x: 40, y: 0 });
  Reflect.set(line, 'left', undefined);
  Reflect.set(line, 'top', undefined);
  preserveLineAnchorPosition(line, 0, new Point(1, 1));
  const roughSettings = { ...settings, roughness: 1, width: 24 };
  Reflect.deleteProperty(roughSettings, 'bowing');

  const roughLine = createLineObject({
    id: 'line-control-geometry-rough-branches',
    labelIndex: 1,
    points: [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
    ],
    settings: roughSettings,
  });

  expect(getLineSegmentMidpoint(roughLine, 0)).toEqual(
    getSketchPolylineSegmentPoint(
      roughLine.sniptaleLinePoints[0]!,
      roughLine.sniptaleLinePoints[1]!,
      {
        bowing: 0,
        roughness: 1,
        seed: LINE_ROUGH_SEED,
        strokeWidth: 24,
      },
      0,
      0.5
    )
  );
});
