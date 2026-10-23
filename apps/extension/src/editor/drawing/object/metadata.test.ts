// @vitest-environment jsdom

import {
  ActiveSelection,
  Canvas,
  Group,
  Path,
  Point,
  Rect,
  Textbox,
  util,
  type Transform,
} from 'fabric';
import { describe, expect, it, vi } from 'vitest';
import type { DrawingObject } from '../../../features/drawing/public';
import {
  createFabricCanvasFixture,
  createTypedTestFixture,
} from '../../testing/fabric-canvas.test-support';
import {
  canonicalizeModifiedEditorDrawingSelection,
  replaceEditorDrawingObjectWithCanonicalGeometry,
} from './canonicalize';
import {
  readEditorDrawingObject,
  stageEditorDrawingObject,
  isEditorDrawingSelection,
  syncEditorDrawingTextObject,
  synchronizeEditorDrawingObjectFromFabric,
  translateEditorDrawingObject,
  writeEditorDrawingObject,
} from './metadata';
import { createEditorDrawingFabricObject } from './vector';
import { resizeLayerObject } from '../../controller/layer-actions/state/resize';
import { applyEditorDrawingInteractionControls } from './controls/apply';

it('preserves bend vertices through duplicate translation, Fabric transforms and metadata revival', async () => {
  const drawing = {
    kind: 'arrow' as const,
    id: 'bent',
    design: 'freehand' as const,
    start: { x: 20, y: 20 },
    end: { x: 220, y: 20 },
    bendPoints: [
      { x: 80, y: 100 },
      { x: 160, y: 60 },
    ],
    color: '#f00',
    width: 12,
    dynamicWidth: false,
  };
  expect(translateEditorDrawingObject(drawing, { x: 30, y: 40 }, 'duplicate')).toMatchObject({
    id: 'duplicate',
    bendPoints: [
      { x: 110, y: 140 },
      { x: 190, y: 100 },
    ],
  });
  const arrow = createEditorDrawingFabricObject(drawing, 1);
  if (!(arrow instanceof Path)) throw new Error('Expected arrow');
  arrow.set({ left: 40, top: 60, scaleX: 2, scaleY: 3, angle: 25 });
  const transform = arrow.calcTransformMatrix();
  const expected = drawing.bendPoints.map((point) =>
    new Point(point.x - arrow.pathOffset.x, point.y - arrow.pathOffset.y).transform(transform)
  );
  const synchronized = synchronizeEditorDrawingObjectFromFabric(arrow);
  if (synchronized?.kind !== 'arrow') throw new Error('Expected arrow metadata');
  synchronized.bendPoints!.forEach((point, index) => {
    expect(point.x).toBeCloseTo(expected[index]!.x, 3);
    expect(point.y).toBeCloseTo(expected[index]!.y, 3);
  });
  const revived = await Path.fromObject({
    ...arrow.toObject(),
    sniptaleDrawingJson: arrow.sniptaleDrawingJson,
  });
  expect(readEditorDrawingObject(revived)).toEqual(synchronized);
  expect(synchronizeEditorDrawingObjectFromFabric(revived)).toMatchObject({
    bendPoints: synchronized.bendPoints!.map((point) => ({
      x: expect.closeTo(point.x, 3),
      y: expect.closeTo(point.y, 3),
    })),
  });
  expect(drawing.bendPoints).toEqual([
    { x: 80, y: 100 },
    { x: 160, y: 60 },
  ]);
});

function createResizableArrow() {
  const arrow = createEditorDrawingFabricObject(
    {
      color: '#f00',
      dynamicWidth: false,
      end: { x: 100, y: 70 },
      id: 'resizable-arrow',
      kind: 'arrow',
      start: { x: 20, y: 30 },
      width: 8,
    },
    1
  );
  if (!(arrow instanceof Path)) throw new Error('Expected arrow path');
  return arrow;
}

function expectArrowGeometryClose(actual: DrawingObject | null, expected: DrawingObject | null) {
  if (actual?.kind !== 'arrow' || expected?.kind !== 'arrow')
    throw new Error('Expected arrow metadata');
  expect(actual.start.x).toBeCloseTo(expected.start.x, 3);
  expect(actual.start.y).toBeCloseTo(expected.start.y, 3);
  expect(actual.end.x).toBeCloseTo(expected.end.x, 3);
  expect(actual.end.y).toBeCloseTo(expected.end.y, 3);
  expect(actual.width).toBeCloseTo(expected.width, 3);
}

it('keeps repeated layer resize and synchronization idempotent, including arrow controls', () => {
  const canvas = new Canvas(document.createElement('canvas'));
  const arrow = createResizableArrow();
  canvas.add(arrow);
  applyEditorDrawingInteractionControls(arrow);
  resizeLayerObject(canvas, arrow.sniptaleId!, 180, 100, () => false);
  const resized = readEditorDrawingObject(arrow);
  expectArrowGeometryClose(synchronizeEditorDrawingObjectFromFabric(arrow), resized);
  if (resized?.kind !== 'arrow') throw new Error('Expected arrow metadata');
  const reference = new Path(arrow.path, {
    ...util.saveObjectTransform(arrow),
    originX: arrow.originX,
    originY: arrow.originY,
    strokeWidth: arrow.strokeWidth,
    scaleX: 180 / arrow.getScaledWidth(),
    scaleY: 100 / arrow.getScaledHeight(),
  });
  const endpoint = (point: { x: number; y: number }) =>
    util.transformPoint(
      new Point(point.x, point.y).subtract(reference.pathOffset),
      reference.calcTransformMatrix()
    );
  const expected = {
    ...resized,
    start: endpoint(resized.start),
    end: endpoint(resized.end),
    width: resized.width * Math.sqrt(reference.scaleX * reference.scaleY),
  };
  resizeLayerObject(canvas, arrow.sniptaleId!, 180, 100, () => false);
  expectArrowGeometryClose(readEditorDrawingObject(arrow), expected);
  expectArrowGeometryClose(synchronizeEditorDrawingObjectFromFabric(arrow), expected);
  arrow.setCoords();
  expect(arrow.oCoords['start']!.x).toBeCloseTo(expected.start.x, 3);
  expect(arrow.oCoords['start']!.y).toBeCloseTo(expected.start.y, 3);
  expect(arrow.oCoords['end']!.x).toBeCloseTo(expected.end.x, 3);
  expect(arrow.oCoords['end']!.y).toBeCloseTo(expected.end.y, 3);
  const endControl = arrow.controls['end']!;
  expect(
    endControl.actionHandler(
      new MouseEvent('mousemove', { ctrlKey: true }),
      createTypedTestFixture<Transform>({ target: arrow }),
      260,
      160
    )
  ).toBe(true);
  arrow.setCoords();
  expect(arrow.oCoords['start']!.x).toBeCloseTo(expected.start.x, 3);
  expect(arrow.oCoords['start']!.y).toBeCloseTo(expected.start.y, 3);
  expect(arrow.oCoords['end']!.x).toBeCloseTo(260, 3);
  expect(arrow.oCoords['end']!.y).toBeCloseTo(160, 3);
  canvas.dispose();
});

it('rotates a previously resized arrow once around the shared selection center', () => {
  const canvas = new Canvas(document.createElement('canvas'));
  const arrow = createResizableArrow();
  const rectangle = createEditorDrawingFabricObject(shape, 2);
  canvas.add(arrow, rectangle);
  resizeLayerObject(canvas, arrow.sniptaleId!, 180, 100, () => false);
  const resized = readEditorDrawingObject(arrow);
  if (resized?.kind !== 'arrow') throw new Error('Expected arrow metadata');
  const active = new ActiveSelection([arrow, rectangle], { canvas });
  canvas.setActiveObject(active);
  const center = active.getCenterPoint();
  const rotate = (point: { x: number; y: number }) =>
    new Point(center.x - (point.y - center.y), center.y + (point.x - center.x));
  const expectedStart = rotate(resized.start);
  const expectedEnd = rotate(resized.end);
  active.rotate(90);
  const replacements = canonicalizeModifiedEditorDrawingSelection({
    canvas,
    object: active,
    prepareObject: () => undefined,
    source: null,
  });
  const result = replacements
    ?.map(readEditorDrawingObject)
    .find((drawing) => drawing?.kind === 'arrow');
  if (result?.kind !== 'arrow') throw new Error('Expected arrow metadata');
  expect(result.start.x).toBeCloseTo(expectedStart.x, 3);
  expect(result.start.y).toBeCloseTo(expectedStart.y, 3);
  expect(result.end.x).toBeCloseTo(expectedEnd.x, 3);
  expect(result.end.y).toBeCloseTo(expectedEnd.y, 3);
  expect(result.width).toBeCloseTo(resized.width, 3);
  canvas.dispose();
});

it('keeps synchronized arrow coordinates consistent after JSON revival', async () => {
  const arrow = createResizableArrow();
  arrow.set({ scaleX: 2, scaleY: 3, angle: 25 });
  const synchronized = synchronizeEditorDrawingObjectFromFabric(arrow);
  const revived = await Path.fromObject({
    ...arrow.toObject(),
    sniptaleDrawingJson: arrow.sniptaleDrawingJson,
  });
  expectArrowGeometryClose(synchronizeEditorDrawingObjectFromFabric(revived), synchronized);
});

it('bakes arrow geometry while retaining its parent transform exactly once', () => {
  const arrow = createResizableArrow();
  const group = new Group([arrow]);
  group.set({ angle: 35, scaleX: 2, scaleY: 3, left: 80, top: 90 });
  const parentTransform = group.calcTransformMatrix();
  const synchronized = synchronizeEditorDrawingObjectFromFabric(arrow);
  expectArrowGeometryClose(synchronizeEditorDrawingObjectFromFabric(arrow), synchronized);
  expect(arrow.group).toBe(group);
  expect(group.calcTransformMatrix()).toEqual(parentTransform);
});

const shape = {
  bounds: { height: 20, width: 40, x: 10, y: 15 },
  color: '#f00',
  fillColor: null,
  id: 'shape-1',
  kind: 'rectangle',
  width: 4,
} satisfies DrawingObject;

it.each([45, 90, -30])(
  'preserves arrow endpoints after a selection rotation of %s degrees',
  (angle) => {
    const canvas = new Canvas(document.createElement('canvas'));
    const drawing: DrawingObject = {
      color: '#f00',
      dynamicWidth: false,
      end: { x: 100, y: 70 },
      id: 'rotated-arrow',
      kind: 'arrow',
      start: { x: 20, y: 30 },
      width: 8,
    };
    const arrow = createEditorDrawingFabricObject(drawing, 1);
    if (!(arrow instanceof Path)) throw new Error('Expected arrow path');
    const rectangle = createEditorDrawingFabricObject({ ...shape, id: 'companion' }, 2);
    canvas.add(arrow, rectangle);
    const active = new ActiveSelection([arrow, rectangle], { canvas });
    canvas.setActiveObject(active);
    active.rotate(angle);
    const endpoint = (point: { x: number; y: number }) =>
      util.transformPoint(
        new Point(point.x, point.y).subtract(arrow.pathOffset),
        arrow.calcTransformMatrix()
      );
    const expectedStart = endpoint(drawing.start);
    const expectedEnd = endpoint(drawing.end);

    const replacements = canonicalizeModifiedEditorDrawingSelection({
      canvas,
      object: active,
      prepareObject: () => undefined,
      source: null,
    });
    const result = readEditorDrawingObject(replacements![0]!);
    expect(result?.kind).toBe('arrow');
    if (result?.kind !== 'arrow') throw new Error('Expected arrow metadata');
    expect(result.start.x).toBeCloseTo(expectedStart.x, 3);
    expect(result.start.y).toBeCloseTo(expectedStart.y, 3);
    expect(result.end.x).toBeCloseTo(expectedEnd.x, 3);
    expect(result.end.y).toBeCloseTo(expectedEnd.y, 3);
    expect(result.width).toBeCloseTo(drawing.width, 3);
    expect((canvas.getActiveObject() as ActiveSelection).getObjects()).toEqual(replacements);
    canvas.dispose();
  }
);

describe('editor drawing metadata authority', () => {
  it('recognizes both drawing objects and all-drawing ActiveSelections', () => {
    const canvas = new Canvas(document.createElement('canvas'));
    const first = createEditorDrawingFabricObject(shape, 1);
    const second = createEditorDrawingFabricObject({ ...shape, id: 'shape-2' }, 2);
    const ordinary = new Rect({ height: 20, width: 20 });
    canvas.add(first, second, ordinary);

    expect(isEditorDrawingSelection(first)).toBe(true);
    expect(isEditorDrawingSelection(new ActiveSelection([first, second], { canvas }))).toBe(true);
    expect(isEditorDrawingSelection(new ActiveSelection([first, ordinary], { canvas }))).toBe(
      false
    );
    canvas.dispose();
  });

  it('normalizes a committed Fabric transform into the shared drawing object', () => {
    const object = createEditorDrawingFabricObject(shape, 1);
    object.set({ angle: 30, left: 70, scaleX: 2, scaleY: 3, top: 80 });

    const synchronized = synchronizeEditorDrawingObjectFromFabric(object);

    expect(synchronized).toMatchObject({
      bounds: { height: 60, width: 80 },
      id: 'shape-1',
      kind: 'rectangle',
      rotation: 30,
    });
    expect(readEditorDrawingObject(object)).toEqual(synchronized);
  });

  it('does not add half the shape stroke after a move is synchronized', () => {
    const object = createEditorDrawingFabricObject(shape, 1);
    object.set({ left: object.left + 20, top: object.top + 30 });

    const synchronized = synchronizeEditorDrawingObjectFromFabric(object);

    expect(synchronized?.kind === 'rectangle' ? synchronized.bounds : null).toMatchObject({
      height: 20,
      width: 40,
      x: 30,
      y: 45,
    });
  });

  it.each([
    shape,
    {
      color: '#111',
      id: 'pencil-1',
      kind: 'pencil' as const,
      samples: [
        { t: 0, x: 10, y: 15 },
        { t: 1, x: 50, y: 35 },
      ],
      width: 4,
    },
    {
      color: '#ff0',
      id: 'marker-1',
      kind: 'marker' as const,
      opacity: 0.5,
      samples: [
        { t: 0, x: 10, y: 15 },
        { t: 1, x: 50, y: 35 },
      ],
      width: 16,
    },
    {
      backgroundColor: '#fff8',
      bounds: { height: 34, width: 120, x: 10, y: 15 },
      color: '#111',
      fontFamily: 'handwritten' as const,
      fontSize: 24,
      id: 'text-1',
      kind: 'text' as const,
      text: 'Round trip',
    },
  ])('preserves center and corners through %s move-scale-rotate canonicalization', (drawing) => {
    const canvas = new Canvas(document.createElement('canvas'));
    const object = createEditorDrawingFabricObject(drawing, 1);
    canvas.add(object);
    object.set({ angle: 25, left: 120, scaleX: 1.5, scaleY: 1.5, top: 90 });
    object.setCoords();
    const center = object.getCenterPoint();
    const corners = object.getCoords();

    const [replacement] =
      canonicalizeModifiedEditorDrawingSelection({
        canvas,
        object,
        prepareObject: () => undefined,
        source: null,
      }) ?? [];

    expect(replacement).toBeDefined();
    expect(replacement!.getCenterPoint().x).toBeCloseTo(center.x, 4);
    expect(replacement!.getCenterPoint().y).toBeCloseTo(center.y, 4);
    if (drawing.kind !== 'text') {
      replacement!.getCoords().forEach((corner, index) => {
        expect(corner.x).toBeCloseTo(corners[index]!.x, 0);
        expect(corner.y).toBeCloseTo(corners[index]!.y, 0);
      });
    } else {
      expect(readEditorDrawingObject(replacement!)).toMatchObject({
        bounds: { width: 180 },
        fontSize: 24,
      });
    }
  });

  it('projects blur rotation around the same center into authoritative metadata', () => {
    const blur = new Rect({ height: 40, left: 80, top: 60, width: 100 });
    writeEditorDrawingObject(blur, {
      bounds: { height: 40, width: 100, x: 80, y: 60 },
      id: 'blur-1',
      kind: 'blur',
    });
    blur.set({ angle: 30, left: 140, originX: 'center', originY: 'center', top: 110 });

    expect(synchronizeEditorDrawingObjectFromFabric(blur)).toMatchObject({
      bounds: { height: 40, width: 100, x: 90, y: 90 },
      rotation: 30,
    });
  });

  it('synchronizes a previous nonzero rotation back to zero', () => {
    const object = createEditorDrawingFabricObject({ ...shape, rotation: 30 }, 1);
    object.set({ angle: 0 });

    expect(synchronizeEditorDrawingObjectFromFabric(object)).toMatchObject({ rotation: 0 });
  });

  it('preserves rotated text center when edited wrapping changes its height', () => {
    const object = createEditorDrawingFabricObject(
      {
        backgroundColor: null,
        bounds: { height: 34, width: 120, x: 20, y: 30 },
        color: '#111',
        fontFamily: 'handwritten',
        fontSize: 24,
        id: 'rotated-text',
        kind: 'text',
        rotation: 30,
        text: 'First line',
      },
      1
    );
    const center = object.getCenterPoint();
    if (!(object instanceof Textbox)) throw new Error('Expected text object');
    object.set({ height: object.height + 40 });

    expect(syncEditorDrawingTextObject(object)).toBe(true);
    const drawing = readEditorDrawingObject(object);
    expect(drawing?.kind === 'text' ? drawing.bounds.y + drawing.bounds.height / 2 : 0).toBeCloseTo(
      center.y,
      4
    );
    const replacement =
      drawing?.kind === 'text' ? createEditorDrawingFabricObject(drawing, 1) : object;
    expect(replacement.getCenterPoint().x).toBeCloseTo(center.x, 4);
    expect(replacement.getCenterPoint().y).toBeCloseTo(center.y, 4);
  });

  it('reconstructs imported Fabric geometry from metadata instead of trusting a mismatch', () => {
    const object = createEditorDrawingFabricObject(shape, 1);
    object.set({ left: 500, scaleX: 4, top: 600 });
    const canvas = {
      getObjects: vi.fn(() => [object]),
      insertAt: vi.fn(),
      remove: vi.fn(),
    };
    const prepareObject = vi.fn();

    const replacement = replaceEditorDrawingObjectWithCanonicalGeometry({
      canvas: createFabricCanvasFixture(canvas),
      object,
      prepareObject,
      source: null,
    });

    expect(replacement).not.toBe(object);
    expect(replacement.scaleX).toBe(1);
    expect(readEditorDrawingObject(replacement)).toEqual(shape);
    expect(canvas.remove).toHaveBeenCalledWith(object);
    expect(canvas.insertAt).toHaveBeenCalledWith(0, replacement);
    expect(prepareObject).toHaveBeenCalledWith(replacement);
  });

  it('preserves retained members and order in a mixed active selection', () => {
    const canvas = new Canvas(document.createElement('canvas'));
    const drawing = createEditorDrawingFabricObject(shape, 1);
    const retained = new Rect({ height: 20, width: 20 });
    retained.sniptaleType = 'step';
    canvas.add(drawing, retained);
    const active = new ActiveSelection([retained, drawing], { canvas });
    canvas.setActiveObject(active);

    const replacements = canonicalizeModifiedEditorDrawingSelection({
      canvas,
      object: active,
      prepareObject: () => undefined,
      source: null,
    });

    expect(replacements?.[0]).toBe(retained);
    expect(replacements?.[1]).not.toBe(drawing);
    expect((canvas.getActiveObject() as ActiveSelection).getObjects()).toEqual(replacements);
  });

  it('translates duplicate geometry and identity as one shared object update', () => {
    const arrow: DrawingObject = {
      color: '#f00',
      dynamicWidth: true,
      end: { x: 30, y: 40 },
      id: 'arrow-1',
      kind: 'arrow',
      start: { x: 10, y: 20 },
      width: 8,
    };
    expect(translateEditorDrawingObject(arrow, { x: 24, y: 24 }, 'arrow-2')).toMatchObject({
      end: { x: 54, y: 64 },
      id: 'arrow-2',
      start: { x: 34, y: 44 },
    });
  });
});

it('replaces staged preview metadata when committing through the document serializer', () => {
  const object = createEditorDrawingFabricObject(shape, 1);
  const preview = { ...shape, color: '#00ff00' };
  stageEditorDrawingObject(object, preview);
  expect(readEditorDrawingObject(object)).toEqual(preview);
  const committed = { ...shape, color: '#0000ff' };
  writeEditorDrawingObject(object, committed);
  expect(readEditorDrawingObject(object)).toEqual(committed);
  expect(JSON.parse(object.sniptaleDrawingJson!)).toEqual({ version: 1, object: committed });
});
