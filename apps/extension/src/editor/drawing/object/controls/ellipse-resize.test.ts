// @vitest-environment jsdom

import { Canvas, Ellipse, util, type Transform } from 'fabric';
import { expect, it } from 'vitest';
import { normalizeScaledRectangleTarget } from '../../../objects/shape-style-rectangle/normalize';
import { canonicalizeModifiedEditorDrawingSelection } from '../canonicalize';
import { createEditorDrawingFabricObject } from '../vector';
import { createDrawingBoxControls } from './box';

type Side = 'ml' | 'mr' | 'mt' | 'mb';

function createCircle() {
  const canvas = new Canvas(document.createElement('canvas'), {
    uniScaleKey: 'shiftKey',
    uniformScaling: false,
  });
  const object = createEditorDrawingFabricObject(
    {
      bounds: { x: 20, y: 30, width: 100, height: 100 },
      color: '#111',
      fillColor: null,
      id: 'resized-circle',
      kind: 'ellipse',
      width: 4,
    },
    1
  );
  if (!(object instanceof Ellipse)) throw new Error('Expected an ellipse');
  canvas.add(object);
  object.controls = createDrawingBoxControls(object);
  object.setCoords();
  return { canvas, object };
}

function createSideTransform(canvas: Canvas, object: Ellipse, side: Side): Transform {
  const origin = canvas._getOriginFromCorner(object, side);
  return {
    actionPerformed: false,
    altKey: false,
    corner: side,
    ex: 0,
    ey: 0,
    height: object.height,
    lastX: 0,
    lastY: 0,
    offsetX: 0,
    offsetY: 0,
    originX: origin.x,
    originY: origin.y,
    original: { ...util.saveObjectTransform(object), originX: origin.x, originY: origin.y },
    scaleX: object.scaleX,
    scaleY: object.scaleY,
    shiftKey: false,
    skewX: object.skewX,
    skewY: object.skewY,
    target: object,
    theta: util.degreesToRadians(0),
    width: object.width,
  };
}

it.each([
  {
    side: 'mr' as const,
    positions: [
      [150, 80],
      [130, 80],
    ],
  },
  {
    side: 'ml' as const,
    positions: [
      [-10, 80],
      [10, 80],
    ],
  },
  {
    side: 'mb' as const,
    positions: [
      [70, 160],
      [70, 140],
    ],
  },
  {
    side: 'mt' as const,
    positions: [
      [70, 0],
      [70, 20],
    ],
  },
] as const)(
  'keeps an oval visible through %s drag, reverse drag, and release',
  ({ side, positions }) => {
    const { canvas, object } = createCircle();
    const transform = createSideTransform(canvas, object, side);
    const control = object.controls[side]!;
    const event = new MouseEvent('mousemove');
    const action = control.getActionHandler(event, object, control);
    if (!action) throw new Error('Expected resize handler');
    const anchoredPoint = object.getPositionByOrigin(transform.originX, transform.originY);
    const horizontal = side === 'ml' || side === 'mr';

    for (const [x, y] of positions) {
      expect(action(event, transform, x, y)).toBe(true);
      object.setCoords();
      expect(normalizeScaledRectangleTarget(object)).toBe(false);
      expect(object.getPositionByOrigin(transform.originX, transform.originY).x).toBeCloseTo(
        anchoredPoint.x,
        4
      );
      expect(object.getPositionByOrigin(transform.originX, transform.originY).y).toBeCloseTo(
        anchoredPoint.y,
        4
      );
      expect(object.getRx()).toBeGreaterThan(1);
      expect(object.getRy()).toBeGreaterThan(1);
      expect(horizontal ? object.getRx() : object.getRy()).toBeGreaterThan(
        horizontal ? object.getRy() : object.getRx()
      );
    }

    const previewWidth = object.getScaledWidth();
    const previewHeight = object.getScaledHeight();
    const replacement = canonicalizeModifiedEditorDrawingSelection({
      canvas,
      object,
      prepareObject: () => undefined,
      source: null,
    })?.[0];
    if (!(replacement instanceof Ellipse)) throw new Error('Expected ellipse replacement');
    expect(replacement.getScaledWidth()).toBeCloseTo(previewWidth, 1);
    expect(replacement.getScaledHeight()).toBeCloseTo(previewHeight, 1);
    canvas.dispose();
  }
);
