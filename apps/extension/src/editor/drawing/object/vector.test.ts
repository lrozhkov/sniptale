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
  updateEditorDrawingShapeDraft,
} from './vector';

describe('Fabric drawing adapter', () => {
  it.each([0, 5, 10, 45])('has continuous Fabric background pixels at %s degrees', (angle) => {
    for (const color of ['#ff8800', '#ff880080']) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 400;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#808080';
      context.fillRect(0, 0, 400, 400);
      const object = createEditorDrawingFabricObject(
        {
          id: 'pixel-proof',
          kind: 'text',
          bounds: { x: 0, y: 0, width: 180, height: 100 },
          text: 'Longer first line\nShort\nLast',
          color: '#00000000',
          backgroundColor: color,
          fontFamily: 'sans',
          fontSize: 24,
        },
        1
      ) as Textbox;
      vi.spyOn(object, 'getLineWidth').mockImplementation((index) => [150, 80, 50][index] ?? 0);
      const radians = (angle * Math.PI) / 180;
      context.save();
      context.translate(200, 200);
      context.rotate(radians);
      renderEditorDrawingTextBackground(object, context);
      context.restore();
      context.fillStyle = color;
      context.fillRect(0, 0, 5, 5);
      const expected = context.getImageData(1, 1, 1, 1).data;
      let edge = object._getTopOffset();
      for (let line = 0; line < 2; line += 1) {
        edge += object.getHeightOfLine(line);
        for (let offset = 20; offset <= 30; offset += 1) {
          for (const delta of [-0.75, -0.25, 0.25, 0.75]) {
            const localX = object._getLeftOffset() + offset;
            const localY = edge + delta;
            const pixel = context.getImageData(
              Math.floor(200 + localX * Math.cos(radians) - localY * Math.sin(radians)),
              Math.floor(200 + localX * Math.sin(radians) + localY * Math.cos(radians)),
              1,
              1
            ).data;
            expect(
              Array.from(pixel).every(
                (channel, index) => Math.abs(channel - expected[index]!) <= 2
              ),
              `${color} line=${line} offset=${offset}`
            ).toBe(true);
          }
        }
      }
    }
  });
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
      text: 'One\nOne',
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
      moveTo: vi.fn(),
      arcTo: vi.fn(),
      closePath: vi.fn(),
    };
    renderEditorDrawingTextBackground(object as Textbox, context);
    expect(context.beginPath).toHaveBeenCalledTimes(1);
    expect(context.fill).toHaveBeenCalledTimes(1);
    expect(context.moveTo).toHaveBeenCalledTimes(1);
    expect(context.closePath).toHaveBeenCalledTimes(1);
    expect(context.arcTo).toHaveBeenCalled();
    expect((object as Textbox)._getLineLeftOffset(0)).toBeCloseTo(6);
    const topOffset = (object as Textbox)._getTopOffset();
    applyEditorDrawingTextVisuals(object as Textbox);
    (object as Textbox)._renderTextLinesBackground(context as unknown as CanvasRenderingContext2D);
    expect((object as Textbox)._getTopOffset()).toBe(topOffset);
    expect((object as Textbox)._getLineLeftOffset(0)).toBeCloseTo(6);
    expect(context.fill).toHaveBeenCalledTimes(2);
  });

  it('removes invisible Fabric stroke geometry from a prepared saved text box', () => {
    const object = createEditorDrawingFabricObject(
      {
        id: 'saved-text',
        kind: 'text',
        bounds: { x: 10, y: 15, width: 120, height: 40 },
        text: 'Saved text',
        color: '#111',
        backgroundColor: null,
        fontFamily: 'sans',
        fontSize: 24,
      },
      1
    ) as Textbox;
    object.set({ strokeWidth: 1 });

    applyEditorDrawingTextVisuals(object);

    expect(object.strokeWidth).toBe(0);
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

  it('keeps every line of a growing multiline textbox inside its selection bounds', () => {
    const object = createEditorDrawingFabricObject(
      {
        id: 'text-multiline',
        kind: 'text',
        bounds: { x: 5, y: 6, width: 180, height: 30 },
        text: 'One\nTwo',
        color: '#111',
        backgroundColor: null,
        fontFamily: 'sans',
        fontSize: 24,
      },
      1
    ) as Textbox;
    object.set({ text: 'One\nTwo\nThree\nFour\nFive\nSix' });
    object.initDimensions();

    expect(synchronizeEditorDrawingTextLayout(object)).toBe(true);
    expect(object.height).toBeGreaterThanOrEqual(object.calcTextHeight() + 4);
    expect(object._textLines).toHaveLength(6);
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

  it('updates geometric drafts without replacing their Fabric identity', () => {
    const first: DrawingObject = {
      id: 'ellipse-1',
      kind: 'ellipse',
      bounds: { x: 5, y: 6, width: 2, height: 2 },
      color: '#f00',
      fillColor: null,
      width: 4,
    };
    const object = createEditorDrawingFabricObject(first, 1);
    const next = { ...first, bounds: { x: 5, y: 6, width: 80, height: 40 } };

    expect(updateEditorDrawingShapeDraft(object, next)).toBe(true);
    expect(readEditorDrawingObject(object)).toEqual(next);
    expect(object.width).toBeCloseTo(80);
    expect(object.height).toBeCloseTo(40);
  });
});
