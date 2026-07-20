import { expect, it } from 'vitest';
import { createDefaultRichShapeObject } from '../../../../features/editor/document/rich-shape';
import { resolveRichShapeRenderableStyle } from '../style/renderable';
import { createPolylineBaseObject } from './base';
import { createPolylineObjects } from './objects';
import { getPolylinePoints } from './points';

function createPolylineGeometry(overrides: { closed: boolean; points: [number, number][] }) {
  return {
    closed: overrides.closed,
    points: overrides.points,
    type: 'polyline' as const,
    viewBox: { height: 20, minX: 0, minY: 0, width: 30 },
  };
}

function createShape() {
  return createDefaultRichShapeObject({
    frame: { height: 20, left: 0, top: 0, width: 30 },
    style: {
      ...createDefaultRichShapeObject().style,
      line: {
        ...createDefaultRichShapeObject().style.line,
        beginArrowhead: 'triangle',
        endArrowhead: 'triangle',
      },
    },
  });
}

it('owns polyline point projection from viewBox into shape frame', () => {
  const points = getPolylinePoints(
    createPolylineGeometry({
      closed: false,
      points: [
        [0, 0],
        [30, 20],
      ],
    }),
    60,
    40
  );

  expect(points).toEqual([
    { x: 0, y: 0 },
    { x: 60, y: 40 },
  ]);
});

it('owns closed Fabric fallback objects', () => {
  const shape = createShape();
  const style = resolveRichShapeRenderableStyle(shape);

  expect(
    createPolylineBaseObject(
      createPolylineGeometry({
        closed: true,
        points: [
          [0, 0],
          [30, 0],
          [30, 20],
        ],
      }),
      shape,
      30,
      20,
      style
    )
  ).toHaveLength(1);
});

it('owns open two-point and multi-point Fabric fallback objects', () => {
  const shape = createShape();
  const style = resolveRichShapeRenderableStyle(shape);

  expect(
    createPolylineBaseObject(
      createPolylineGeometry({
        closed: false,
        points: [
          [0, 0],
          [30, 20],
        ],
      }),
      shape,
      30,
      20,
      style
    )
  ).toHaveLength(1);
  expect(
    createPolylineBaseObject(
      createPolylineGeometry({
        closed: false,
        points: [
          [0, 0],
          [15, 10],
          [30, 20],
        ],
      }),
      shape,
      30,
      20,
      style
    )
  ).toHaveLength(1);
});

it('adds arrowhead decoration only for open polylines with enough points', () => {
  const shape = createShape();
  const style = resolveRichShapeRenderableStyle(shape);

  expect(
    createPolylineObjects(
      createPolylineGeometry({
        closed: false,
        points: [
          [0, 0],
          [30, 20],
        ],
      }),
      shape,
      style
    ).length
  ).toBeGreaterThan(1);
  expect(
    createPolylineObjects(
      createPolylineGeometry({
        closed: true,
        points: [
          [0, 0],
          [30, 0],
          [30, 20],
        ],
      }),
      shape,
      style
    )
  ).toHaveLength(1);
});
