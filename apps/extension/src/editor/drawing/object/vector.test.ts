// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { Path, Textbox } from 'fabric';
import type { DrawingObject } from '../../../features/drawing/public';
import { readEditorDrawingObject } from './metadata';
import {
  applyEditorDrawingTextVisuals,
  createEditorDrawingFabricObject,
  renderEditorDrawingTextBackground,
  replaceEditorDrawingFabricGeometry,
  synchronizeEditorDrawingTextLayout,
  updateEditorDrawingPathDraft,
} from './vector';

describe('Fabric drawing adapter', () => {
  it('maps shared objects to current editor types and metadata', () => {
    const shape: DrawingObject = {
      id: 'shape-1',
      kind: 'ellipse',
      bounds: { x: 5, y: 6, width: 40, height: 20 },
      color: '#f00',
      fillColor: '#fff8',
      width: 4,
    };
    const object = createEditorDrawingFabricObject(shape, 2);
    expect(object.sniptaleType).toBe('shape');
    expect(object.sniptaleId).toBe('shape-1');
    expect(readEditorDrawingObject(object)).toEqual(shape);
  });

  it('uses per-line text background and the shared font mapping', () => {
    const text: DrawingObject = {
      id: 'text-1',
      kind: 'text',
      bounds: { x: 5, y: 6, width: 120, height: 40 },
      text: 'One\nTwo',
      color: '#111',
      backgroundColor: '#ff08',
      fontFamily: 'handwritten',
      fontSize: 24,
    };
    const object = createEditorDrawingFabricObject(text, 1);
    expect(object).toBeInstanceOf(Textbox);
    expect((object as Textbox).backgroundColor).toBe('');
    expect((object as Textbox).textBackgroundColor).toBe('#ff08');
    expect((object as Textbox).fontFamily).toContain('Sniptale Handwritten');
    expect((object as Textbox).lineHeight).toBe(1.25);
    const context = {
      beginPath: vi.fn(),
      fill: vi.fn(),
      fillStyle: '#000000',
      roundRect: vi.fn(),
    };
    renderEditorDrawingTextBackground(object as Textbox, context);
    expect(context.roundRect).toHaveBeenCalledTimes(2);
    expect(context.roundRect.mock.calls[0]?.[0]).toBe((object as Textbox)._getLeftOffset());
    expect((object as Textbox)._getLineLeftOffset(0)).toBeCloseTo(6);
    const topOffset = (object as Textbox)._getTopOffset();
    applyEditorDrawingTextVisuals(object as Textbox);
    expect((object as Textbox)._getTopOffset()).toBe(topOffset);
    expect((object as Textbox)._getLineLeftOffset(0)).toBeCloseTo(6);
    expect(context.fill).toHaveBeenCalledTimes(2);
  });

  it('expands a new text box while typing until the shared working-area limit', () => {
    const object = createEditorDrawingFabricObject(
      {
        id: 'text-auto',
        kind: 'text',
        bounds: { x: 5, y: 6, width: 80, height: 34 },
        text: 'A much longer shared drawing line',
        color: '#111',
        backgroundColor: null,
        fontFamily: 'sans',
        fontSize: 24,
      },
      1
    ) as Textbox;
    object.sniptaleDrawingTextAutoWidth = true;
    object.sniptaleDrawingTextMaxWidth = 220;
    expect(synchronizeEditorDrawingTextLayout(object)).toBe(true);
    expect(object.width).toBeGreaterThan(80);
    expect(object.width).toBeLessThanOrEqual(220);
  });

  it.each([
    { fontFamily: 'serif' as const, fontSize: 24 },
    { fontFamily: 'sans' as const, fontSize: 36 },
  ])('commits measured text bounds with typography updates', (typography) => {
    const current = createEditorDrawingFabricObject(
      {
        backgroundColor: null,
        bounds: { height: 24, width: 100, x: 20, y: 30 },
        color: '#111',
        fontFamily: 'sans',
        fontSize: 16,
        id: 'text-settings',
        kind: 'text',
        text: 'A text line that can wrap',
      },
      1
    );
    const drawing = readEditorDrawingObject(current);
    if (drawing?.kind !== 'text') throw new Error('Expected text drawing');

    const replacement = replaceEditorDrawingFabricGeometry(current, {
      ...drawing,
      ...typography,
    });
    const committed = readEditorDrawingObject(replacement);

    expect(committed).toMatchObject(typography);
    expect(committed?.kind === 'text' ? committed.bounds.height : 0).toBeCloseTo(
      replacement.height,
      4
    );
    expect(committed?.kind === 'text' ? committed.bounds.width : 0).toBeCloseTo(
      replacement.width,
      4
    );
    expect(committed?.kind === 'text' ? committed.bounds.x : 0).toBe(20);
    expect(committed?.kind === 'text' ? committed.bounds.y : 0).toBe(30);
  });

  it('updates freehand draft geometry in place for stable pointer performance', () => {
    const first: DrawingObject = {
      id: 'pencil-1',
      kind: 'pencil',
      color: '#111',
      width: 4,
      samples: [
        { x: 0, y: 0, t: 0 },
        { x: 10, y: 10, t: 1 },
      ],
    };
    const object = createEditorDrawingFabricObject(first, 1, { preview: true });
    expect(object).toBeInstanceOf(Path);
    const next = { ...first, samples: [...first.samples, { x: 20, y: 5, t: 2 }] };
    expect(updateEditorDrawingPathDraft(object, next, { preview: true })).toBe(true);
    expect(readEditorDrawingObject(object)).toEqual(next);
  });
});
