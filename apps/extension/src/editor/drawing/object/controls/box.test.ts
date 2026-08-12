// @vitest-environment jsdom

import { FabricObject, util, type Transform } from 'fabric';
import { expect, it } from 'vitest';
import { createDrawingBoxControls, createDrawingTextControls } from './box';

it('provides every directional resize handle and rotation for box drawings', () => {
  const object = new FabricObject({ sniptaleType: 'shape' });

  expect(Object.keys(createDrawingBoxControls(object))).toEqual([
    'tl',
    'mt',
    'tr',
    'mr',
    'br',
    'mb',
    'bl',
    'ml',
    'mtr',
  ]);
});

it('limits drawing text to width resize handles and rotation', () => {
  const object = new FabricObject({ sniptaleType: 'text' });

  expect(Object.keys(createDrawingTextControls(object))).toEqual(['ml', 'mr', 'mtr']);
});

it('preserves aspect ratio and the opposite-side anchor for Shift side resize', () => {
  const object = new FabricObject({
    height: 50,
    left: 10,
    sniptaleType: 'shape',
    top: 20,
    width: 100,
  });
  object.controls = createDrawingBoxControls(object);
  object.setCoords();
  const anchor = object.getPointByOrigin('left', 'center');
  const transform: Transform = {
    actionPerformed: false,
    altKey: false,
    corner: 'mr',
    ex: 110,
    ey: 45,
    height: object.height,
    lastX: 110,
    lastY: 45,
    offsetX: 0,
    offsetY: 0,
    originX: 'left',
    originY: 'center',
    original: {
      ...util.saveObjectTransform(object),
      originX: 'left',
      originY: 'center',
    },
    scaleX: object.scaleX,
    scaleY: object.scaleY,
    shiftKey: true,
    skewX: object.skewX,
    skewY: object.skewY,
    target: object,
    theta: util.degreesToRadians(0),
    width: object.width,
  };
  const event = new MouseEvent('mousemove', { shiftKey: true });
  const control = object.controls['mr']!;

  control.getActionHandler(event, object, control)?.(event, transform, 160, 45);

  expect(object.scaleX).toBeGreaterThan(1);
  expect(object.scaleY).toBeCloseTo(object.scaleX, 4);
  expect(object.getPointByOrigin('left', 'center').x).toBeCloseTo(anchor.x, 4);
  expect(object.getPointByOrigin('left', 'center').y).toBeCloseTo(anchor.y, 4);
});
