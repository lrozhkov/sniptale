// @vitest-environment jsdom
import { Canvas, Group, Point, Rect, Textbox } from 'fabric';
import { EditorCanvas } from '../../document/canvas-surface/render-region';
import { serializeCanvasObjects } from '../../controller/document/serialization';
import { createEditorDrawingFabricObject } from './vector';
import { expect, it, vi } from 'vitest';
import {
  canonicalizeModifiedEditorDrawingSelection,
  restoreCanonicalEditorDrawingObjects,
} from './canonicalize';
import { readEditorDrawingObject, writeEditorDrawingObject } from './metadata';

it('restores a scene-scaled text layer below the insertion minimum without changing its width or identity', () => {
  const canvas = new Canvas(document.createElement('canvas'), { renderOnAddRemove: false });
  try {
    const peer = new Rect({ left: 0, top: 0, width: 80, height: 40 });
    const text = new Textbox('Small', {
      left: 12,
      top: 23,
      width: 32,
      fontSize: 8,
      strokeWidth: 0,
    });
    text.sniptaleRole = 'annotation';
    text.sniptaleType = 'text';
    text.sniptaleId = 'saved-label';
    text.sniptaleLabel = 'Saved label';
    text.sniptaleLocked = true;
    writeEditorDrawingObject(text, {
      kind: 'text',
      id: 'saved-label',
      bounds: { x: 12, y: 23, width: 32, height: 15 },
      fontSize: 8,
      color: '#000000',
      backgroundColor: null,
      text: 'Small',
    });
    canvas.add(peer, text);
    const prepareObject = vi.fn();
    restoreCanonicalEditorDrawingObjects({ canvas, source: null, prepareObject });
    const restored = canvas.getObjects()[1]!;
    expect(canvas.getObjects()[0]).toBe(peer);
    expect(restored).not.toBe(text);
    expect(restored.getScaledWidth()).toBeCloseTo(32, 3);
    expect(restored.left).toBe(12);
    expect(restored.top).toBe(23);
    expect(restored.sniptaleId).toBe('saved-label');
    expect(restored.sniptaleLabel).toBe('Saved label');
    expect(restored.sniptaleLocked).toBe(true);
    expect(readEditorDrawingObject(restored)).toMatchObject({
      kind: 'text',
      fontSize: 8,
      bounds: { width: 32 },
    });
    expect(prepareObject).toHaveBeenCalledWith(restored);
  } finally {
    void canvas.dispose();
  }
});

it('canonicalizes a transformed nested drawing in its parent and restores its serialized history pose', async () => {
  const canvas = new EditorCanvas(document.createElement('canvas'), { renderOnAddRemove: false });
  const drawing = createEditorDrawingFabricObject(
    {
      kind: 'rectangle',
      id: 'nested-drawing',
      bounds: { x: 20, y: 30, width: 60, height: 40 },
      color: '#123456',
      fillColor: null,
      width: 2,
    },
    1
  );
  const peer = new Rect({ left: 130, top: 90, width: 30, height: 20 });
  peer.sniptaleType = 'shape';
  peer.sniptaleId = 'peer';
  const group = new Group([drawing, peer], { angle: 30, scaleX: 2, scaleY: 2 });
  group.sniptaleType = 'group';
  group.sniptaleId = 'group';
  canvas.add(group);
  canvas.enterSelectionGroup(group);
  canvas.setActiveObject(drawing);
  const original = drawing.getCoords();
  const peerBefore = peer.getCoords();
  const before = serializeCanvasObjects(canvas);
  drawing.setXY(drawing.getXY().add(new Point(15, -8)));
  drawing.set({ scaleX: drawing.scaleX * 1.25, scaleY: drawing.scaleY * 1.25 });
  drawing.setCoords();
  const changed = drawing.getCoords();
  const replacements = canonicalizeModifiedEditorDrawingSelection({
    canvas,
    object: drawing,
    source: null,
    prepareObject: vi.fn(),
  });
  const replacement = replacements![0]!;
  expect(replacement).not.toBe(drawing);
  expect(replacement.parent).toBe(group);
  expect(replacement.sniptaleId).toBe('nested-drawing');
  expect(group.getObjects()).toEqual([replacement, peer]);
  replacement
    .getCoords()
    .forEach((point, index) => expect(point.distanceFrom(changed[index]!)).toBeLessThan(0.001));
  peer
    .getCoords()
    .forEach((point, index) => expect(point.distanceFrom(peerBefore[index]!)).toBeLessThan(0.001));
  expect(readEditorDrawingObject(replacement)).toMatchObject({
    bounds: { width: 150, height: 100 },
  });
  await canvas.loadFromJSON(before);
  const restoredGroup = canvas.getObjects()[0] as Group;
  const restored = restoredGroup.getObjects()[0]!;
  restored
    .getCoords()
    .forEach((point, index) => expect(point.distanceFrom(original[index]!)).toBeLessThan(0.001));
  expect(restored.sniptaleId).toBe('nested-drawing');
  expect(canvas.getSelectionGroupScope()).toBeNull();
  void canvas.dispose();
});

it('keeps nested text content, auto width and scaled font geometry during canonical replacement', () => {
  const canvas = new EditorCanvas(document.createElement('canvas'), { renderOnAddRemove: false });
  const text = createEditorDrawingFabricObject(
    {
      kind: 'text',
      id: 'nested-text',
      bounds: { x: 30, y: 40, width: 160, height: 40 },
      fontSize: 24,
      text: 'Source text',
      color: '#000000',
      backgroundColor: null,
      autoWidth: true,
      wrapWidth: 240,
    },
    1
  );
  const group = new Group([text], { angle: 30, scaleX: 2, scaleY: 2 });
  group.sniptaleType = 'group';
  canvas.add(group);
  canvas.setActiveObject(text);
  const center = text.getCenterPoint();
  const replacement = canonicalizeModifiedEditorDrawingSelection({
    canvas,
    object: text,
    source: null,
    prepareObject: vi.fn(),
  })![0]!;
  expect(replacement.parent).toBe(group);
  expect(replacement.getCenterPoint().distanceFrom(center)).toBeLessThan(0.001);
  expect(readEditorDrawingObject(replacement)).toMatchObject({
    kind: 'text',
    text: 'Source text',
    fontSize: 48,
    autoWidth: true,
    wrapWidth: 480,
  });
  void canvas.dispose();
});
