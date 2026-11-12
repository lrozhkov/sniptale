// @vitest-environment jsdom
import { Group, Point, util, type Transform } from 'fabric';
import { expect, it, vi } from 'vitest';
import { getEditorBuiltInShapeEntry } from '../../../../features/editor/document/rich-shape';
import {
  createRichShapeCatalogObject,
  createRichShapeObject,
  exportRichShapeDocumentObject,
  isRichShapeObject,
  normalizeScaledRichShapeObject,
} from '../../../objects/rich-shape';
import { createRichShapeDocumentObjectFromCatalog } from '../../../objects/rich-shape/catalog-object';
import { createCustomRichShapeInsertionObject } from '../../tools/custom-rich-shape-insertion';
import {
  applyLineLikeRichShapeControls,
  getRichShapeSelectionGeometry,
} from './rich-shape-controls';

function shape(id: string, lineWidth = 2) {
  const entry = getEditorBuiltInShapeEntry(id)!;
  const document = createRichShapeDocumentObjectFromCatalog({
    entry,
    id,
    labelIndex: 1,
    left: 20,
    top: 30,
    width: 160,
    height: 100,
  });
  document.style.line.width = lineWidth;
  const object = createRichShapeObject(document)!;
  applyLineLikeRichShapeControls(object);
  return object;
}

function point(object: ReturnType<typeof shape>, endpoint: 'start' | 'end') {
  const control = object.controls[endpoint]!;
  return control.positionHandler(new Point(), [1, 0, 0, 1, 0, 0], object, control);
}

it('puts the visible connector handle on the rendered inset endpoint', () => {
  const object = shape('elbow-connector');
  const positions = object.calcOCoords();
  const start = positions['start'] ?? positions['bl']!;
  const end = positions['end'] ?? positions['tr']!;
  expect(start.x).toBeCloseTo(42.4);
  expect(start.y).toBeCloseTo(108);
  expect(end.x).toBeCloseTo(157.6);
  expect(end.y).toBeCloseTo(52);
});

it.each([
  'line',
  'arrow',
  'double-line-arrow',
  'left-line-arrow',
  'straight-connector',
  'elbow-connector',
  'curved-connector',
])('places %s controls on canonical endpoints instead of bounds', (id) => {
  const object = shape(id);
  const inset = id === 'elbow-connector' || id === 'curved-connector';
  expect(Object.keys(object.controls)).toEqual(['start', 'end']);
  expect(point(object, 'start').x).toBeCloseTo(20 + (inset ? 22.4 : 0));
  expect(point(object, 'start').y).toBeCloseTo(30 + (inset ? 78 : 100));
  expect(point(object, 'end').x).toBeCloseTo(20 + (inset ? 137.6 : 160));
  expect(point(object, 'end').y).toBeCloseTo(30 + (inset ? 22 : 0));
  expect(object.hasBorders).toBe(false);
});

it('moves an inset endpoint through a rotated scaled parent without moving its opposite endpoint', () => {
  const object = shape('elbow-connector', 18);
  object.set({ angle: 31, scaleX: 1.4, scaleY: 0.8 });
  const parent = new Group([object], { angle: 17, scaleX: 1.3, scaleY: 0.7 });
  const before = point(object, 'start');
  const end = point(object, 'end');
  const destination = end.add(new Point(35, -24));
  const parentPoint = destination.transform(util.invertTransform(parent.calcTransformMatrix()));
  const transform = gesture(object);
  expect(
    object.controls['end']!.actionHandler(
      new MouseEvent('mousemove'),
      transform,
      parentPoint.x,
      parentPoint.y
    )
  ).toBe(true);
  expect(point(object, 'start').x).toBeCloseTo(before.x);
  expect(point(object, 'start').y).toBeCloseTo(before.y);
  expect(point(object, 'end').x).toBeCloseTo(destination.x);
  expect(point(object, 'end').y).toBeCloseTo(destination.y);
  const final = point(object, 'end');
  expect(normalizeScaledRichShapeObject(object)).toBe(true);
  expect(point(object, 'end').x).toBeCloseTo(final.x);
  expect(point(object, 'end').y).toBeCloseTo(final.y);
});

it.each([
  { name: 'quadratic', end: ['Q', 50, 15, 90, 20] },
  { name: 'arc', end: ['A', 70, 70, 0, 0, 0, 90, 20] },
] as const)(
  'edits an imported $name connector at its path endpoints without replacing the artwork',
  ({ end }) => {
    const geometry = {
      type: 'path',
      viewBox: { minX: 0, minY: 0, width: 100, height: 100 },
      paths: [{ commands: [['M', 10, 80], end] }],
    };
    const object = createCustomRichShapeInsertionObject({
      shapeId: 'imported-connector',
      customDefinition: {
        id: 'imported-connector',
        label: 'Imported connector',
        category: 'Lines',
        tags: [],
        capabilities: ['line', 'connectors'],
        geometry,
        richShapeDefaults: { shapeFamily: 'connector', shapeKind: 'curved-connector' },
      },
      source: {
        id: 'source',
        dataUrl: 'data:image/png;base64,',
        name: null,
        intrinsicWidth: 800,
        intrinsicHeight: 600,
        displayWidth: 800,
        displayHeight: 600,
        left: 0,
        top: 0,
        visible: true,
        locked: true,
      },
      nextLabelIndex: 1,
      left: 20,
      top: 30,
      width: 160,
      height: 100,
      prepareObject: applyLineLikeRichShapeControls,
    });
    if (!object || !isRichShapeObject(object)) throw new Error('Expected a restored connector');
    expect(point(object, 'start').x).toBeCloseTo(36);
    expect(point(object, 'start').y).toBeCloseTo(110);
    expect(point(object, 'end').x).toBeCloseTo(164);
    expect(point(object, 'end').y).toBeCloseTo(50);
    expect(
      object.controls['end']!.actionHandler(new MouseEvent('mousemove'), gesture(object), 180, 40)
    ).toBe(true);
    expect(point(object, 'start').x).toBeCloseTo(36);
    expect(point(object, 'start').y).toBeCloseTo(110);
    expect(point(object, 'end').x).toBeCloseTo(180);
    expect(point(object, 'end').y).toBeCloseTo(40);
    expect(normalizeScaledRichShapeObject(object)).toBe(true);
    expect(point(object, 'end').x).toBeCloseTo(180);
    expect(point(object, 'end').y).toBeCloseTo(40);
    expect(exportRichShapeDocumentObject(object).geometry).toEqual(geometry);
  }
);

it.each([
  'rectangle',
  'rounded-rectangle',
  'flowchart-process',
  'flowchart-terminator',
  'action-button-home',
  'action-button-information',
])('classifies %s rectangular artwork without changing it', (id) => {
  const entry = getEditorBuiltInShapeEntry(id)!;
  const object = createRichShapeCatalogObject({ entry, id, labelIndex: 1, left: 20, top: 30 });
  const document = structuredClone(object.sniptaleRichShape);
  const children = object.getObjects();
  const controls = object.controls;
  applyLineLikeRichShapeControls(object);
  expect(getRichShapeSelectionGeometry(object)).toBe('rectangle');
  expect(object.hasBorders).toBe(false);
  expect(object.controls).toBe(controls);
  expect(object.getObjects()).toEqual(children);
  expect(object.sniptaleRichShape).toEqual(document);
  expect(getRichShapeSelectionGeometry(shape('oval'))).toBe('box');
});

function canvasFor(object: ReturnType<typeof shape>, uniformScaling = false) {
  const canvas = {
    viewportTransform: [1, 0, 0, 1, 0, 0],
    uniformScaling,
    uniScaleKey: 'shiftKey',
    getZoom: () => 1,
    getRetinaScaling: () => 1,
    fire: vi.fn(),
    setCursor: vi.fn(),
  };
  object.canvas = canvas as never;
  return canvas;
}

function gesture(object: ReturnType<typeof shape>, endpoint: 'start' | 'end' = 'end'): Transform {
  const anchor = object.controls[endpoint]!.getTransformAnchorPoint();
  return {
    target: object,
    originX: anchor.x,
    originY: anchor.y,
    corner: endpoint,
    scaleX: object.scaleX,
    scaleY: object.scaleY,
    skewX: object.skewX,
    skewY: object.skewY,
    offsetX: 0,
    offsetY: 0,
    ex: 0,
    ey: 0,
    lastX: 0,
    lastY: 0,
    theta: util.degreesToRadians(object.angle),
    width: object.width,
    height: object.height,
    shiftKey: false,
    altKey: false,
    actionPerformed: false,
    original: {
      ...util.saveObjectTransform(object),
      originX: object.originX,
      originY: object.originY,
    },
  };
}

it('reports scaling only after the true endpoint correction and retains style', () => {
  const object = shape('curved-connector', 12);
  const document = structuredClone(object.sniptaleRichShape);
  const canvas = canvasFor(object);
  const before = point(object, 'start');
  const desired = point(object, 'end').add(new Point(30, -12));
  object.on('scaling', () => {
    expect(point(object, 'end').x).toBeCloseTo(desired.x);
    expect(point(object, 'end').y).toBeCloseTo(desired.y);
  });
  expect(
    object.controls['end']!.actionHandler(
      new MouseEvent('mousemove'),
      gesture(object),
      desired.x,
      desired.y
    )
  ).toBe(true);
  expect(canvas.fire).toHaveBeenCalledWith(
    'object:scaling',
    expect.objectContaining({ target: object })
  );
  expect(point(object, 'start').x).toBeCloseTo(before.x);
  expect(point(object, 'start').y).toBeCloseTo(before.y);
  expect(object.sniptaleRichShape).toEqual(document);
});

it('retains proportional Shift and configurable Ctrl behavior without accumulating drift', () => {
  const object = shape('elbow-connector');
  const canvas = canvasFor(object);
  const before = point(object, 'start');
  const desired = point(object, 'end').add(new Point(40, -10));
  const transform = gesture(object);
  const action = object.controls['end']!.actionHandler;
  action(new MouseEvent('mousemove', { shiftKey: true }), transform, desired.x, desired.y);
  expect(object.scaleX).toBeCloseTo(object.scaleY);
  action(new MouseEvent('mousemove'), transform, desired.x, desired.y);
  expect(point(object, 'end').x).toBeCloseTo(desired.x);
  expect(point(object, 'end').y).toBeCloseTo(desired.y);
  canvas.uniScaleKey = 'ctrlKey';
  action(new MouseEvent('mousemove', { ctrlKey: true }), transform, desired.x, desired.y);
  expect(object.scaleX).toBeCloseTo(object.scaleY);
  expect(point(object, 'start').x).toBeCloseTo(before.x);
  expect(point(object, 'start').y).toBeCloseTo(before.y);
});

it('retains centered scaling, lock and minimum-scale policies', () => {
  const object = shape('line');
  canvasFor(object);
  const center = object.getRelativeCenterPoint();
  const desired = point(object, 'end').add(new Point(30, -20));
  object.controls['end']!.actionHandler(
    new MouseEvent('mousemove'),
    { ...gesture(object), originX: 'center', originY: 'center' },
    desired.x,
    desired.y
  );
  expect(object.getRelativeCenterPoint().x).toBeCloseTo(center.x);
  expect(object.getRelativeCenterPoint().y).toBeCloseTo(center.y);
  object.set({ lockScalingX: true, lockScalingY: true });
  const scales = [object.scaleX, object.scaleY];
  expect(
    object.controls['end']!.actionHandler(
      new MouseEvent('mousemove'),
      gesture(object),
      desired.x + 20,
      desired.y
    )
  ).toBe(false);
  expect([object.scaleX, object.scaleY]).toEqual(scales);
  object.set({ lockScalingX: false, lockScalingY: false, lockScalingFlip: true });
  const start = point(object, 'start');
  expect(
    object.controls['end']!.actionHandler(
      new MouseEvent('mousemove'),
      gesture(object),
      start.x - 10,
      start.y + 10
    )
  ).toBe(false);
  object.set({ lockScalingFlip: false, minScaleLimit: 0.2 });
  object.controls['end']!.actionHandler(
    new MouseEvent('mousemove'),
    gesture(object),
    start.x + 0.01,
    start.y - 0.01
  );
  expect(object.scaleX).toBeGreaterThanOrEqual(0.2);
  expect(object.scaleY).toBeGreaterThanOrEqual(0.2);
});
