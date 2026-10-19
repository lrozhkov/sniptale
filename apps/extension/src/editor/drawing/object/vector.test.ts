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

it('bounds zoomed scratch allocation to the visible destination and skips offscreen text', () => {
  const object = createEditorDrawingFabricObject(
    {
      id: 'clipped-stencil',
      kind: 'text',
      bounds: { x: -20.25, y: -10.45, width: 300, height: 100 },
      text: 'Stencil TEST\nSecond line',
      color: '#00000000',
      backgroundColor: '#f97316',
      fontFamily: 'serif',
      fontSize: 32,
    },
    1
  ) as Textbox;
  object.set({ fontFamily: 'serif' });
  applyEditorDrawingTextVisuals(object);
  const render = (width: number, height: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#235b92';
    context.fillRect(0, 0, width, height);
    context.scale(4, 4);
    const composite = vi.spyOn(context, 'drawImage');
    object.render(context);
    return { context, composite };
  };
  const reference = render(1600, 1200).context.getImageData(0, 0, 240, 180).data;
  const visible = render(240, 180);
  const actual = visible.context.getImageData(0, 0, 240, 180).data;
  expect(actual.every((channel, index) => Math.abs(channel - reference[index]!) <= 16)).toBe(true);
  let solidPixels = 0;
  let changedSolidPixels = 0;
  for (let offset = 0; offset < reference.length; offset += 4) {
    const solid = [
      [35, 91, 146],
      [249, 115, 22],
    ].some((color) => color.every((channel, index) => reference[offset + index] === channel));
    if (!solid) continue;
    solidPixels += 1;
    if (
      !actual
        .subarray(offset, offset + 4)
        .every((channel, index) => channel === reference[offset + index])
    ) {
      changedSolidPixels += 1;
    }
  }
  expect(solidPixels).toBeGreaterThan(100);
  expect(changedSolidPixels).toBe(0);
  expect(visible.composite).toHaveBeenCalledTimes(1);
  const scratch = visible.composite.mock.calls[0]![0];
  if (!(scratch instanceof HTMLCanvasElement)) throw new Error('Expected stencil canvas');
  expect(scratch.width).toBeLessThanOrEqual(240);
  expect(scratch.height).toBeLessThanOrEqual(180);
  object.set({ left: 1000, top: 1000 });
  const glyphs = vi.spyOn(object, '_renderTextFill');
  const allocate = vi.spyOn(document, 'createElement');
  const offscreen = render(240, 180);
  expect(offscreen.composite).not.toHaveBeenCalled();
  expect(glyphs).not.toHaveBeenCalled();
  expect(allocate).toHaveBeenCalledTimes(1);
  expect(scratch.width).toBeLessThanOrEqual(240);
  expect(scratch.height).toBeLessThanOrEqual(180);
  allocate.mockRestore();
});

it.each([0, 17])(
  'preserves native glyph cores on a fractional raster grid at %s degrees',
  (angle) => {
    const object = createEditorDrawingFabricObject(
      {
        id: 'fractional-stencil',
        kind: 'text',
        bounds: { x: 57.35, y: 71.65, width: 300, height: 100 },
        text: 'Stencil TEST\nSecond line',
        color: '#111827',
        backgroundColor: '#f97316',
        fontFamily: 'serif',
        fontSize: 32,
      },
      1
    ) as Textbox;
    object.set({ angle, fontFamily: 'serif' });
    applyEditorDrawingTextVisuals(object);
    const render = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 500;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#235b92';
      context.fillRect(0, 0, 500, 500);
      context.translate(0.3, 0.45);
      context.scale(1.25, 1.25);
      object.render(context);
      return context.getImageData(0, 0, 500, 500).data;
    };
    const normal = render();
    object.set({ fill: '#00000000' });
    const stencil = render();
    let cores = 0;
    let covered = 0;
    for (let offset = 0; offset < normal.length; offset += 4) {
      if (
        ![17, 24, 39].every((channel, index) => Math.abs(normal[offset + index]! - channel) <= 1)
      ) {
        continue;
      }
      cores += 1;
      if (
        [35, 91, 146].some((channel, index) => Math.abs(stencil[offset + index]! - channel) > 5)
      ) {
        covered += 1;
      }
    }
    expect(cores).toBeGreaterThan(100);
    expect(covered / cores).toBeLessThan(0.01);
  }
);

it.each([
  { angle: 0, zoom: 1, backgroundColor: '#ff8800' },
  { angle: 45, zoom: 2, backgroundColor: '#ff880080' },
])('cuts glyphs only through their own fill at $angle degrees and zoom $zoom', (options) => {
  const object = createEditorDrawingFabricObject(
    {
      id: 'stencil',
      kind: 'text',
      bounds: { x: 100, y: 100, width: 160, height: 80 },
      text: 'Hole\nText',
      color: '#00000000',
      backgroundColor: options.backgroundColor,
      fontFamily: 'sans',
      fontSize: 48,
    },
    1
  ) as Textbox;
  object.set({ angle: options.angle, fontFamily: 'sans-serif' });
  applyEditorDrawingTextVisuals(object);
  const source = object.sniptaleDrawingJson;
  const render = (draw: boolean) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 600;
    const context = canvas.getContext('2d')!;
    for (let top = 0; top < 600; top += 10) {
      for (let left = 0; left < 600; left += 10) {
        context.fillStyle = (top + left) % 20 === 0 ? '#215b92' : '#e5d4b3';
        context.fillRect(left, top, 10, 10);
      }
    }
    context.fillStyle = '#1d8753';
    context.fillRect(180, 0, 60, 600);
    context.scale(options.zoom, options.zoom);
    if (draw) object.render(context);
    expect(context.globalCompositeOperation).toBe('source-over');
    return context.getImageData(0, 0, 600, 600).data;
  };
  const scene = render(false);
  const stencil = render(true);
  applyEditorDrawingTextVisuals(object);
  expect(render(true).every((channel, index) => channel === stencil[index])).toBe(true);
  expect(object.fill).toBe('#00000000');
  expect(object.objectCaching).toBe(false);
  expect(object.sniptaleDrawingJson).toBe(source);
  object.set({ fill: '#000000' });
  const fillRender = vi.spyOn(object, '_renderTextFill').mockImplementationOnce(() => {});
  const background = render(true);
  fillRender.mockRestore();
  const normal = render(true);
  object.set({ fill: '#00000080' });
  const partial = render(true);
  let holes = 0;
  let filled = 0;
  let partialGlyphs = 0;
  let damagedScenePixels = 0;
  for (let offset = 0; offset < normal.length; offset += 4) {
    if (stencil[offset + 3] !== 255) damagedScenePixels += 1;
    const reference = normal.subarray(offset, offset + 3);
    if (reference.every((channel) => channel < 24)) {
      const original = scene.subarray(offset, offset + 3);
      const actual = stencil.subarray(offset, offset + 3);
      if (actual.every((channel, index) => Math.abs(channel - original[index]!) <= 16)) {
        holes += 1;
      }
      if (
        partial
          .subarray(offset, offset + 3)
          .every((channel, index) => Math.abs(channel - background[offset + index]! / 2) <= 16)
      ) {
        partialGlyphs += 1;
      }
    } else if (
      reference.some((channel, index) => Math.abs(channel - scene[offset + index]!) > 20) &&
      reference.every((channel, index) => Math.abs(channel - stencil[offset + index]!) <= 2)
    ) {
      filled += 1;
    }
  }
  expect(holes).toBeGreaterThan(100);
  expect(filled).toBeGreaterThan(100);
  expect(partialGlyphs).toBeGreaterThan(100);
  expect(damagedScenePixels).toBe(0);
  object.set({ fill: '#00000000', textBackgroundColor: '' });
  expect(render(true).every((channel, index) => channel === scene[index])).toBe(true);
  object.set({ textBackgroundColor: options.backgroundColor });
  expect(render(true).every((channel, index) => channel === stencil[index])).toBe(true);
});

it.each(['#000000', '#00000080', '#00000000'])(
  'preserves normal glyph rendering for %s without a background',
  (color) => {
    const object = createEditorDrawingFabricObject(
      {
        id: 'unfilled-text',
        kind: 'text',
        bounds: { x: 20, y: 20, width: 160, height: 60 },
        text: 'Text',
        color,
        backgroundColor: null,
        fontFamily: 'sans',
        fontSize: 32,
      },
      1
    ) as Textbox;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 240;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 240, 240);
    object.render(context);
    const pixels = context.getImageData(0, 0, 240, 240).data;
    const minimum = pixels.reduce((lowest, channel) => Math.min(lowest, channel), 255);
    if (color === '#00000000') expect(minimum).toBe(255);
    else {
      const solid = color === '#000000' ? 0 : 127;
      expect(minimum).toBeGreaterThanOrEqual(solid);
      expect(minimum).toBeLessThanOrEqual(solid + 16);
    }
    expect(object.fill).toBe(color);
  }
);

it('restores the transparent glyph color when a stencil render fails', () => {
  const object = createEditorDrawingFabricObject(
    {
      id: 'failed-stencil',
      kind: 'text',
      bounds: { x: 20, y: 20, width: 160, height: 60 },
      text: 'Text',
      color: '#00000000',
      backgroundColor: '#ff8800',
      fontFamily: 'sans',
      fontSize: 32,
    },
    1
  ) as Textbox;
  vi.spyOn(object, '_renderTextCommon').mockImplementationOnce(() => {
    throw new Error('Glyph render failed');
  });
  const context = document.createElement('canvas').getContext('2d')!;
  expect(() => object._render(context)).toThrow('Glyph render failed');
  expect(object.fill).toBe('#00000000');
  expect(context.globalCompositeOperation).toBe('source-over');
  expect(() => object._render(context)).not.toThrow();
  expect(object.fill).toBe('#00000000');
});

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
            Array.from(pixel).every((channel, index) => Math.abs(channel - expected[index]!) <= 2),
            `${color} line=${line} offset=${offset}`
          ).toBe(true);
        }
      }
    }
  }
});
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
describe('Fabric drawing adapter', () => {
  it.each([
    { fontSize: 16, text: 'One', color: '#111' },
    { fontSize: 24, text: 'One\nTwo', color: '#00000000' },
    { fontSize: 36, text: 'One\nTwo\nThree', color: '#111' },
  ])(
    'keeps the text fill within selection bounds: $fontSize $color',
    ({ fontSize, text, color }) => {
      const object = createEditorDrawingFabricObject(
        {
          id: 'background-bounds',
          kind: 'text',
          bounds: { x: 5, y: 6, width: 280, height: 30 },
          text,
          color,
          backgroundColor: '#f97316',
          fontFamily: 'serif',
          fontSize,
        },
        1
      ) as Textbox;
      synchronizeEditorDrawingTextLayout(object);
      const originalWidth = object.width;
      const context = {
        beginPath: vi.fn(),
        fill: vi.fn(),
        fillStyle: '#000',
        moveTo: vi.fn(),
        arcTo: vi.fn(),
        closePath: vi.fn(),
      };
      renderEditorDrawingTextBackground(object, context);
      const coordinates = context.arcTo.mock.calls.flatMap(([firstX, firstY, secondX, secondY]) => [
        { x: firstX, y: firstY },
        { x: secondX, y: secondY },
      ]);
      expect(coordinates.length).toBeGreaterThan(0);
      for (const point of coordinates) {
        expect(point.y).toBeGreaterThanOrEqual(-object.height / 2);
        expect(point.y).toBeLessThanOrEqual(object.height / 2);
      }
      expect(object.width).toBe(originalWidth);
    }
  );

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
