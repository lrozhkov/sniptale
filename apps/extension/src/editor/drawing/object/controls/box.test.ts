// @vitest-environment jsdom

import { Canvas, FabricObject, util, type Transform } from 'fabric';
import { expect, it } from 'vitest';
import { createDrawingBoxControls, createDrawingTextControls } from './box';
import { canonicalizeModifiedEditorDrawingSelection } from '../canonicalize';
import { readEditorDrawingObject } from '../metadata';
import { createEditorDrawingFabricObject } from '../vector';

function createCircle() {
  const object = createEditorDrawingFabricObject(
    {
      bounds: { x: 20, y: 30, width: 100, height: 100 },
      color: '#111111',
      fillColor: null,
      id: 'circle-resize',
      kind: 'ellipse',
      width: 4,
    },
    1
  );
  const canvas = new Canvas(document.createElement('canvas'));
  canvas.add(object);
  object.controls = createDrawingBoxControls(object);
  object.setCoords();
  return object;
}

function dragResize(
  object: FabricObject,
  corner: 'mr' | 'mb' | 'br',
  x: number,
  y: number,
  originX: 'left' | 'center',
  originY: 'top' | 'center'
) {
  const transform: Transform = {
    actionPerformed: false,
    altKey: false,
    corner,
    ex: x,
    ey: y,
    height: object.height,
    lastX: x,
    lastY: y,
    offsetX: 0,
    offsetY: 0,
    originX,
    originY,
    original: { ...util.saveObjectTransform(object), originX, originY },
    scaleX: object.scaleX,
    scaleY: object.scaleY,
    shiftKey: false,
    skewX: object.skewX,
    skewY: object.skewY,
    target: object,
    theta: util.degreesToRadians(0),
    width: object.width,
  };
  const event = new MouseEvent('mousemove');
  const control = object.controls[corner]!;
  return control.getActionHandler(event, object, control)?.(event, transform, x, y);
}

it('resizes a circle independently along each axis without moving the opposite side', () => {
  const horizontal = createCircle();
  const left = horizontal.getPointByOrigin('left', 'center');
  const initialHeight = horizontal.getScaledHeight();
  expect(dragResize(horizontal, 'mr', 150, 80, 'left', 'center')).toBe(true);
  expect(horizontal.getPointByOrigin('left', 'center').x).toBeCloseTo(left.x);
  expect(horizontal.getPointByOrigin('left', 'center').y).toBeCloseTo(left.y);
  expect(horizontal.getScaledWidth()).toBeGreaterThan(125);
  expect(horizontal.getScaledWidth()).toBeLessThan(136);
  expect(horizontal.getScaledHeight()).toBeCloseTo(initialHeight);

  const vertical = createCircle();
  const top = vertical.getPointByOrigin('center', 'top');
  const initialWidth = vertical.getScaledWidth();
  expect(dragResize(vertical, 'mb', 70, 160, 'center', 'top')).toBe(true);
  expect(vertical.getPointByOrigin('center', 'top').x).toBeCloseTo(top.x);
  expect(vertical.getPointByOrigin('center', 'top').y).toBeCloseTo(top.y);
  expect(vertical.getScaledWidth()).toBeCloseTo(initialWidth);
  expect(vertical.getScaledHeight()).toBeGreaterThan(125);
  expect(vertical.getScaledHeight()).toBeLessThan(136);
  horizontal.canvas?.dispose();
  vertical.canvas?.dispose();
});

it('lets a circle corner change width and height without forcing its prior ratio', () => {
  const object = createCircle();
  const opposite = object.getPointByOrigin('left', 'top');
  expect(dragResize(object, 'br', 160, 140, 'left', 'top')).toBe(true);
  expect(object.getPointByOrigin('left', 'top').x).toBeCloseTo(opposite.x);
  expect(object.getPointByOrigin('left', 'top').y).toBeCloseTo(opposite.y);
  expect(object.getScaledWidth()).toBeGreaterThan(125);
  expect(object.getScaledHeight()).toBeGreaterThan(105);
  expect(object.getScaledWidth() - object.getScaledHeight()).toBeGreaterThan(15);
  const canvas = object.canvas;
  if (!(canvas instanceof Canvas)) throw new Error('Expected an editor canvas');
  const replacement = canonicalizeModifiedEditorDrawingSelection({
    canvas,
    object,
    prepareObject: () => undefined,
    source: null,
  })?.[0];
  expect(replacement).toBeDefined();
  expect(replacement!.getScaledWidth() - replacement!.getScaledHeight()).toBeGreaterThan(15);
  expect(replacement!.getPointByOrigin('left', 'top').x).toBeCloseTo(opposite.x);
  expect(replacement!.getPointByOrigin('left', 'top').y).toBeCloseTo(opposite.y);
  expect(readEditorDrawingObject(replacement!)?.kind).toBe('ellipse');
  canvas.dispose();
});

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

it('keeps corner resize cursors diagonal on elongated drawings and follows rotation', () => {
  const object = new FabricObject({ height: 12, width: 600, sniptaleType: 'shape' });
  const controls = createDrawingBoxControls(object);
  const canvas = new Canvas(document.createElement('canvas'));
  canvas.add(object);
  object.controls = controls;
  object.setCoords();
  const event = new MouseEvent('mousemove');
  const cursor = (key: 'tl' | 'tr') =>
    controls[key]!.cursorStyleHandler(event, controls[key]!, object, object.calcOCoords()[key]!);

  expect(cursor('tl')).toBe('nwse-resize');
  expect(cursor('tr')).toBe('nesw-resize');

  object.set({ angle: 45 });
  object.setCoords();
  expect(cursor('tl')).toBe('ns-resize');

  object.set({ angle: 0, flipX: true });
  object.setCoords();
  expect(cursor('tl')).toBe('nesw-resize');

  object.set({ lockScalingX: true });
  expect(cursor('tl')).toBe('not-allowed');
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
