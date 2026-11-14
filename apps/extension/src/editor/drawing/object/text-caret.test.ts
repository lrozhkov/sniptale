// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { StaticCanvas, Textbox } from 'fabric';
import { applyEditorDrawingTextVisuals, createEditorDrawingFabricObject } from './vector';
import { readEditorDrawingObject } from './metadata';

it.each(['#00000000', '#00000080', '#111827'])(
  'keeps the editing caret opaque without changing glyph color %s',
  (color) => {
    const object = createEditorDrawingFabricObject(
      {
        id: 'text-caret',
        kind: 'text',
        bounds: { x: 0, y: 0, width: 160, height: 40 },
        text: 'Caret',
        color,
        backgroundColor: '#f97316',
        fontFamily: 'sans',
        fontSize: 24,
      },
      1
    ) as Textbox;
    expect(object.cursorColor).toBe('#2563eb');
    expect(object.fill).toBe(color);
    expect(readEditorDrawingObject(object)).toMatchObject({ color, text: 'Caret' });
  }
);
describe.each(['ltr', 'rtl'] as const)('editing caret geometry in %s text', (direction) => {
  it.each([0.5, 1, 2])('keeps the caret quiet and precise at zoom %s', (zoom) => {
    const canvas = new StaticCanvas(document.createElement('canvas'), { renderOnAddRemove: false });
    const object = new Textbox('First\nNext\n', { fontSize: 24, fontFamily: 'serif', direction });
    canvas.setZoom(zoom);
    canvas.add(object);
    object.set({ scaleX: 1.5, scaleY: 1.5 });
    applyEditorDrawingTextVisuals(object);
    applyEditorDrawingTextVisuals(object);
    for (const index of [0, 2, 5, 6, 10, 11]) {
      const boundaries = object._getCursorBoundaries(index, true);
      const baseline = Textbox.prototype.getCursorRenderingData.call(object, index, boundaries);
      const actual = object.getCursorRenderingData(index, boundaries);
      const multiplier = zoom * 1.5;
      const edge = index === 0 || index === 6 ? -2 : index === 5 || index === 10 ? 2 : 0;
      const shift = edge * (direction === 'rtl' ? -1 : 1);
      expect(actual.width * multiplier).toBeCloseTo(1.5, 6);
      expect(actual.height).toBeCloseTo(baseline.height * 0.8, 6);
      expect(actual.top + actual.height / 2).toBeCloseTo(baseline.top + baseline.height / 2, 6);
      if (direction === 'rtl' || edge === 0) {
        expect(
          (actual.left + actual.width / 2 - baseline.left - baseline.width / 2) * multiplier
        ).toBeCloseTo(shift, 6);
      } else {
        const { lineIndex } = object.get2DCursorLocation(index);
        const context = document.createElement('canvas').getContext('2d')!;
        context.font = object._getFontDeclaration();
        const metrics = context.measureText(object._textLines[lineIndex]!.join(''));
        const origin = object._getLeftOffset() + object._getLineLeftOffset(lineIndex);
        const gap =
          edge > 0
            ? actual.left - origin - metrics.actualBoundingBoxRight
            : origin - metrics.actualBoundingBoxLeft - actual.left - actual.width;
        expect(gap * multiplier).toBeCloseTo(2, 6);
      }
      expect(actual.color).toBe('#2563eb');
    }
    expect(object.text).toBe('First\nNext\n');
    void canvas.dispose();
  });
});

it.each([42, 5])(
  'positions the end caret from visible ink rather than glyph advance; ink=%s',
  (inkRight) => {
    const canvas = new StaticCanvas(document.createElement('canvas'), { renderOnAddRemove: false });
    const object = createEditorDrawingFabricObject(
      {
        id: 'ink-caret',
        kind: 'text',
        text: 'т',
        bounds: { x: 0, y: 0, width: 160, height: 40 },
        color: '#111111',
        backgroundColor: null,
        fontFamily: 'handwritten',
        fontSize: 24,
      },
      1
    ) as Textbox;
    canvas.add(object);
    const context = document.createElement('canvas').getContext('2d')!;
    const metrics = context.measureText('т');
    vi.spyOn(context, 'measureText').mockReturnValue({
      ...metrics,
      actualBoundingBoxRight: inkRight,
      actualBoundingBoxLeft: 1,
    });
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    try {
      const cursor = object.getCursorRenderingData(1, object._getCursorBoundaries(1, true));
      const right = object._getLeftOffset() + object._getLineLeftOffset(0) + inkRight;
      expect(cursor.left - right).toBeCloseTo(2, 6);
    } finally {
      getContext.mockRestore();
      void canvas.dispose();
    }
  }
);

it.each(['space-end', 'space-start', 'styled', 'spacing', 'justify'] as const)(
  'preserves logical insertion positions for %s',
  (mode) => {
    const canvas = new StaticCanvas(document.createElement('canvas'), { renderOnAddRemove: false });
    const object = new Textbox(mode === 'space-end' ? 'т ' : mode === 'space-start' ? ' т' : 'тс', {
      fontSize: 24,
      width: 160,
    });
    canvas.add(object);
    if (mode === 'styled') object.setSelectionStyles({ fontWeight: 'bold' }, 0, 1);
    if (mode === 'spacing') object.charSpacing = 100;
    if (mode === 'justify') object.textAlign = 'justify';
    applyEditorDrawingTextVisuals(object);
    const index = mode === 'space-start' ? 0 : object.text.length;
    const boundaries = object._getCursorBoundaries(index, true);
    const native = Textbox.prototype.getCursorRenderingData.call(object, index, boundaries);
    const actual = object.getCursorRenderingData(index, boundaries);
    expect(actual.left - native.left).toBeCloseTo(mode === 'space-start' ? -2 : 2, 6);
    void canvas.dispose();
  }
);

it.each(['missing', 'throws', 'nonfinite'] as const)(
  'preserves a usable caret when ink measurement %s',
  (failure) => {
    const canvas = new StaticCanvas(document.createElement('canvas'), { renderOnAddRemove: false });
    const object = new Textbox('т', { fontSize: 24 });
    canvas.add(object);
    applyEditorDrawingTextVisuals(object);
    const index = object.text.length;
    const boundaries = object._getCursorBoundaries(index, true);
    const native = Textbox.prototype.getCursorRenderingData.call(object, index, boundaries);
    const context = document.createElement('canvas').getContext('2d')!;
    const metrics = context.measureText('т');
    vi.spyOn(context, 'measureText').mockReturnValue({
      ...metrics,
      actualBoundingBoxRight: Number.NaN,
    });
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => {
        if (failure === 'throws') throw new Error('Canvas unavailable');
        return failure === 'missing' ? null : context;
      });
    try {
      const actual = object.getCursorRenderingData(index, boundaries);
      expect(actual.left - native.left).toBeCloseTo(2, 6);
      expect(actual.color).toBe('#2563eb');
    } finally {
      getContext.mockRestore();
      void canvas.dispose();
    }
  }
);
