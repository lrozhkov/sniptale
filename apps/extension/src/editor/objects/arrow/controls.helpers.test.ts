import { describe, expect, it } from 'vitest';
import { EDITOR_CANVAS_ACCENT } from '../../color/palette/constants';
import {
  getArrowControlKey,
  getArrowEndpointIndex,
  getEditableArrowPoints,
  getStoredArrowPointIndex,
  readArrowAuthoredPoints,
  readArrowPoints,
  readArrowGeometry,
  resolveArrowStoredPointFromControl,
} from './controls.helpers';
import { readArrowSettings } from './settings';
import type { ArrowPathInstance } from './controls.types';

function createArrow(overrides: Partial<ArrowPathInstance> = {}): ArrowPathInstance {
  return {
    sniptaleArrowControlX: undefined,
    sniptaleArrowControlY: undefined,
    sniptaleArrowEndHead: undefined,
    sniptaleArrowEndX: 30,
    sniptaleArrowEndY: 40,
    sniptaleArrowMode: undefined,
    sniptaleArrowOpacity: undefined,
    sniptaleArrowPointsJson: undefined,
    sniptaleArrowShadow: undefined,
    sniptaleArrowWidth: undefined,
    sniptaleArrowStartHead: undefined,
    sniptaleArrowStartX: 10,
    sniptaleArrowStartY: 20,
    sniptaleArrowColor: undefined,
    strokeWidth: undefined,
    ...overrides,
  } as ArrowPathInstance;
}

function assertReadsArrowSettings(): void {
  expect(readArrowSettings(createArrow())).toMatchObject({
    color: EDITOR_CANVAS_ACCENT,
    dynamicWidth: false,
    endHead: 'triangle',
    endHeadSize: 1,
    mode: 'straight',
    opacity: 1,
    roughness: 0,
    bowing: 0,
    shadow: 0,
    shadowAngle: 90,
    shadowBlur: 12,
    shadowColor: EDITOR_CANVAS_ACCENT,
    shadowDistance: 4,
    startHead: 'none',
    startHeadSize: 1,
    style: 'solid',
    arrowType: 'sharp',
    variant: 'standard',
    width: 4,
  });
}

function assertReadsArrowWidthMetadata(): void {
  expect(
    readArrowSettings(
      createArrow({
        sniptaleArrowDynamicWidth: true,
        sniptaleArrowShadowAngle: 135,
        sniptaleArrowShadowBlur: 20,
        sniptaleArrowShadowColor: '#123456',
        sniptaleArrowShadowDistance: 9,
        sniptaleArrowType: 'curved',
        sniptaleArrowWidth: 9,
        strokeWidth: 2,
      } as never)
    )
  ).toMatchObject({
    arrowType: 'curved',
    dynamicWidth: true,
    mode: 'curve',
    shadowAngle: 135,
    shadowBlur: 20,
    shadowColor: '#123456',
    shadowDistance: 9,
    variant: 'standard',
    width: 9,
  });
}

function assertReadsSerializedCurveGeometry(): void {
  const arrow = createArrow({
    sniptaleArrowMode: 'curve',
    sniptaleArrowPointsJson: JSON.stringify([
      { x: 10, y: 20 },
      { x: 50, y: 60 },
    ]),
  });

  const points = readArrowPoints(arrow);

  expect(points).toHaveLength(3);
  expect(readArrowGeometry(arrow)).toEqual({
    control: points[1],
    end: { x: 50, y: 60 },
    start: { x: 10, y: 20 },
  });
}

function assertKeepsAuthoredElbowPointsSeparateFromRenderedRoute(): void {
  const arrow = createArrow({
    sniptaleArrowPointsJson: JSON.stringify([
      { x: 0, y: 0 },
      { x: 30, y: 20 },
      { x: 60, y: 20 },
    ]),
    sniptaleArrowType: 'elbow',
  } as never);

  expect(readArrowAuthoredPoints(arrow)).toEqual([
    { x: 0, y: 0 },
    { x: 30, y: 20 },
    { x: 60, y: 20 },
  ]);
  expect(readArrowPoints(arrow)).toEqual([
    { x: 0, y: 0 },
    { x: 15, y: 0 },
    { x: 15, y: 20 },
    { x: 60, y: 20 },
  ]);
}

function assertMapsEditablePointIndexes(): void {
  const straightArrow = createArrow({
    sniptaleArrowControlX: 20,
    sniptaleArrowControlY: 30,
  });
  const curveArrow = createArrow({
    sniptaleArrowControlX: 20,
    sniptaleArrowControlY: 30,
    sniptaleArrowMode: 'curve',
  });
  const straightPoints = readArrowPoints(straightArrow);
  const curvePoints = readArrowPoints(curveArrow);
  const straightEditablePoints = getEditableArrowPoints(straightArrow);

  expect(straightEditablePoints).not.toEqual([straightPoints[0], straightPoints[2]]);
  expect(straightEditablePoints[0]).toEqual({ x: 5.757359312880715, y: 15.757359312880716 });
  expect(straightEditablePoints[1]).toEqual({ x: 34.242640687119284, y: 44.242640687119284 });
  expect(getStoredArrowPointIndex(readArrowSettings(straightArrow), straightPoints, 1)).toBe(2);
  expect(getEditableArrowPoints(curveArrow)[1]).toEqual(curvePoints[1]);
  expect(getEditableArrowPoints(curveArrow)).not.toEqual(curvePoints);
  expect(getStoredArrowPointIndex(readArrowSettings(curveArrow), curvePoints, 1)).toBe(1);
  expect(getArrowControlKey(0, 3)).toBe('start');
  expect(getArrowControlKey(1, 3)).toBe('point-1');
  expect(getArrowControlKey(2, 3)).toBe('end');
  expect(getArrowEndpointIndex(0, 3)).toBe(0);
  expect(getArrowEndpointIndex(1, 3)).toBeNull();
  expect(getArrowEndpointIndex(2, 3)).toBe(2);
}

function assertFallsBackToStoredEndpointGeometry(): void {
  const arrow = createArrow({
    sniptaleArrowControlX: 25,
    sniptaleArrowControlY: 35,
  });

  expect(readArrowPoints(arrow)).toEqual([
    { x: 10, y: 20 },
    { x: 25, y: 35 },
    { x: 30, y: 40 },
  ]);
  expect(
    getEditableArrowPoints(arrow, {
      color: '#fff',
      endHead: 'triangle',
      mode: 'straight',
      opacity: 1,
      shadow: 0,
      startHead: 'none',
      variant: 'standard',
      width: 4,
    })
  ).not.toEqual([
    { x: 10, y: 20 },
    { x: 30, y: 40 },
  ]);
}

function assertResolvesEndpointHandlesFromProvisionalDirection(): void {
  expect(
    resolveArrowStoredPointFromControl(
      {
        color: '#fff',
        endHead: 'triangle',
        mode: 'straight',
        opacity: 1,
        shadow: 0,
        startHead: 'none',
        variant: 'standard',
        width: 4,
      },
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
      ],
      1,
      { x: -28, y: 0 }
    )
  ).toEqual({ x: -22, y: 0 });
}

function assertScalesEndpointHandleOffsetForWideArrows(): void {
  const arrow = createArrow({
    sniptaleArrowEndX: 40,
    sniptaleArrowEndY: 0,
    sniptaleArrowStartX: 0,
    sniptaleArrowStartY: 0,
    sniptaleArrowWidth: 12,
  });

  expect(getEditableArrowPoints(arrow)).toEqual([
    { x: -12, y: 0 },
    { x: 52, y: 0 },
  ]);
}

function assertTaperedVariantUsesSharedCurveEditing(): void {
  const taperedArrow = createArrow({
    sniptaleArrowControlX: 25,
    sniptaleArrowControlY: 35,
    sniptaleArrowMode: 'curve',
    sniptaleArrowVariant: 'tapered',
  });

  expect(readArrowPoints(taperedArrow)).toEqual([
    { x: 10, y: 20 },
    { x: 25, y: 35 },
    { x: 30, y: 40 },
  ]);
  expect(getEditableArrowPoints(taperedArrow)).toHaveLength(3);
}

function assertSharpArrowsKeepAuthoredBendControls(): void {
  const sharpArrow = createArrow({
    sniptaleArrowMode: 'straight',
    sniptaleArrowPointsJson: JSON.stringify([
      { x: 0, y: 0 },
      { x: 20, y: 10 },
      { x: 40, y: 0 },
    ]),
    sniptaleArrowType: 'sharp',
  } as never);
  const points = readArrowPoints(sharpArrow);

  expect(getEditableArrowPoints(sharpArrow)).toHaveLength(3);
  expect(getEditableArrowPoints(sharpArrow)[1]).toEqual(points[1]);
  expect(getStoredArrowPointIndex(readArrowSettings(sharpArrow), points, 1, true)).toBe(1);
}

describe('object-factory arrow control helpers', () => {
  it('reads arrow settings with editor defaults', assertReadsArrowSettings);

  it('reads arrow width metadata with stroke-width fallback', assertReadsArrowWidthMetadata);

  it('reads serialized curve points and derived geometry', assertReadsSerializedCurveGeometry);

  it(
    'keeps authored elbow points separate from the rendered route',
    assertKeepsAuthoredElbowPointsSeparateFromRenderedRoute
  );

  it(
    'maps editable points and control metadata for straight and curve arrows',
    assertMapsEditablePointIndexes
  );

  it(
    'falls back to stored arrow endpoints when serialized points are absent',
    assertFallsBackToStoredEndpointGeometry
  );

  it(
    'resolves endpoint handles from the provisional next direction when the segment flips',
    assertResolvesEndpointHandlesFromProvisionalDirection
  );

  it(
    'scales endpoint handle offset for wide arrows',
    assertScalesEndpointHandleOffsetForWideArrows
  );

  it(
    'keeps tapered arrows on the shared curve-editing control path',
    assertTaperedVariantUsesSharedCurveEditing
  );

  it(
    'keeps authored bend controls visible after switching curved arrows back to sharp',
    assertSharpArrowsKeepAuthoredBendControls
  );
});
