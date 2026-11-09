// @vitest-environment jsdom
import { Canvas, Rect, Textbox } from 'fabric';
import { expect, it, vi } from 'vitest';
import { restoreCanonicalEditorDrawingObjects } from './canonicalize';
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
