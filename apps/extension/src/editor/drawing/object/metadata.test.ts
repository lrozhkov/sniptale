// @vitest-environment jsdom

import { ActiveSelection, Canvas, Rect, Textbox } from 'fabric';
import { describe, expect, it, vi } from 'vitest';
import type { DrawingObject } from '../../../features/drawing/public';
import { createFabricCanvasFixture } from '../../testing/fabric-canvas.test-support';
import {
  canonicalizeModifiedEditorDrawingSelection,
  replaceEditorDrawingObjectWithCanonicalGeometry,
} from './canonicalize';
import {
  readEditorDrawingObject,
  syncEditorDrawingTextObject,
  synchronizeEditorDrawingObjectFromFabric,
  translateEditorDrawingObject,
  writeEditorDrawingObject,
} from './metadata';
import { createEditorDrawingFabricObject } from './vector';

const shape: DrawingObject = {
  bounds: { height: 20, width: 40, x: 10, y: 15 },
  color: '#f00',
  fillColor: null,
  id: 'shape-1',
  kind: 'rectangle',
  width: 4,
};

describe('editor drawing metadata authority', () => {
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
