// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { renderDrawingObject, renderDrawingSelection } from './render';
import type { DrawingObject } from '../../features/drawing/public';

const stencilText: Extract<DrawingObject, { kind: 'text' }> = {
  id: 'stencil',
  kind: 'text',
  bounds: { x: 70, y: 80, width: 300, height: 190 },
  rotation: 0,
  text: 'Holes\nThrough',
  color: 'transparent',
  backgroundColor: '#ff8800',
  fontFamily: 'serif',
  fontSize: 72,
};

function createPixelCanvas(pattern = false): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 500;
  const context = canvas.getContext('2d')!;
  if (pattern) {
    for (let column = 0; column < 500; column += 10) {
      context.fillStyle = column % 20 === 0 ? '#2299cc' : '#bb33aa';
      context.fillRect(column, 0, 10, 500);
    }
    renderDrawingObject(
      context,
      {
        id: 'under-text',
        kind: 'rectangle',
        color: '#22cc44',
        fillColor: '#22cc44',
        width: 1,
        bounds: { x: 90, y: 80, width: 70, height: 200 },
      },
      { x: 0, y: 0 }
    );
  }
  return context;
}

it('renders the curved shaft and bend chrome without filling the empty selection bounds', () => {
  const context = createPixelCanvas();
  const arrow: Extract<DrawingObject, { kind: 'arrow' }> = {
    kind: 'arrow',
    id: 'bent',
    design: 'freehand',
    start: { x: 20, y: 20 },
    end: { x: 220, y: 20 },
    bendPoints: [{ x: 120, y: 120 }],
    color: '#ff0000',
    width: 12,
    dynamicWidth: false,
  };
  renderDrawingObject(context, arrow, { x: 0, y: 0 });
  const nearVertex = context.getImageData(114, 114, 12, 12).data;
  expect([...nearVertex].some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
  expect(context.getImageData(120, 20, 1, 1).data[3]).toBe(0);
  renderDrawingSelection(context, arrow, { x: 0, y: 0 }, { x: 70, y: 80 });
  expect(context.getImageData(120, 120, 1, 1).data[3]).toBeGreaterThan(0);
  expect(context.getImageData(70, 80, 1, 1).data[3]).toBeGreaterThan(0);
  expect(context.getImageData(20, 120, 1, 1).data[3]).toBe(0);
});

it('shows only the transient bend marker when ordinary selection chrome is suppressed', () => {
  const context = createPixelCanvas();
  const arrow: Extract<DrawingObject, { kind: 'arrow' }> = {
    kind: 'arrow',
    id: 'bent',
    design: 'freehand',
    start: { x: 20, y: 20 },
    end: { x: 220, y: 20 },
    color: '#f00',
    width: 12,
    dynamicWidth: false,
  };
  renderDrawingSelection(context, arrow, { x: 0, y: 0 }, undefined, true);
  expect(context.getImageData(0, 0, 500, 500).data.every((value) => value === 0)).toBe(true);
  renderDrawingSelection(context, arrow, { x: 0, y: 0 }, { x: 120, y: 20 }, true);
  expect(context.getImageData(120, 20, 1, 1).data[3]).toBeGreaterThan(0);
  expect(context.getImageData(20, 20, 1, 1).data[3]).toBe(0);
  expect(context.getImageData(220, 20, 1, 1).data[3]).toBe(0);
});

it.each([
  { rotation: 0, zoom: 1, backgroundColor: '#ff8800', opacity: 1 },
  { rotation: 32, zoom: 1.6, backgroundColor: '#ff880080', opacity: 0.55 },
  { rotation: -17, zoom: 0.8, backgroundColor: '#ff8800', opacity: 0.4 },
])('cuts only its own fill over scene pixels at $rotation degrees and $zoom zoom', (settings) => {
  const scene = createPixelCanvas(true).getImageData(0, 0, 500, 500).data;
  const context = createPixelCanvas(true);
  const mask = createPixelCanvas();
  const projection = { x: 7, y: 11 };
  const object = { ...stencilText, ...settings };
  for (const target of [context, mask]) target.scale(settings.zoom, settings.zoom);
  renderDrawingObject(mask, { ...object, color: '#ffffff', backgroundColor: null }, projection);
  context.globalAlpha = 0.8;
  renderDrawingObject(context, object, projection, { opacity: settings.opacity });
  const glyphs = mask.getImageData(0, 0, 500, 500).data;
  const result = context.getImageData(0, 0, 500, 500).data;
  let interiorPixels = 0;
  let changedPixels = 0;
  let scenePixelsErased = 0;
  for (let row = 1; row < 499; row += 1) {
    for (let column = 1; column < 499; column += 1) {
      const offset = (row * 500 + column) * 4;
      if (result[offset + 3] !== 255) scenePixelsErased += 1;
      if (result[offset] !== scene[offset]) changedPixels += 1;
      const interior = [-1, 0, 1].every((deltaY) =>
        [-1, 0, 1].every(
          (deltaX) => glyphs[((row + deltaY) * 500 + column + deltaX) * 4 + 3] === 255
        )
      );
      if (!interior) continue;
      interiorPixels += 1;
      const tolerance = settings.rotation === 0 ? 0 : 3;
      expect(
        Array.from(result.slice(offset, offset + 4)).every(
          (channel, index) => Math.abs(channel - scene[offset + index]!) <= tolerance
        )
      ).toBe(true);
    }
  }
  expect(interiorPixels).toBeGreaterThan(40);
  expect(scenePixelsErased).toBe(0);
  expect(changedPixels).toBeGreaterThan(100);
  expect(context.globalAlpha).toBeCloseTo(0.8);
  expect(context.globalCompositeOperation).toBe('source-over');
});

it('keeps fully transparent text without a fill invisible', () => {
  const context = createPixelCanvas(true);
  const before = context.getImageData(0, 0, 500, 500).data;
  renderDrawingObject(context, { ...stencilText, backgroundColor: null }, { x: 0, y: 0 });
  const after = context.getImageData(0, 0, 500, 500).data;
  expect(after.every((channel, index) => channel === before[index])).toBe(true);
});

it('bounds zoomed stencil allocation to the visible scene without changing visible pixels', () => {
  const context = createPixelCanvas(true);
  const scene = context.getImageData(0, 0, 500, 500).data;
  const reference = createPixelCanvas();
  reference.canvas.width = reference.canvas.height = 1_500;
  reference.drawImage(context.canvas, 0, 0);
  const object = {
    ...stencilText,
    bounds: { x: 70.35, y: 60.65, width: 250, height: 64 },
    fontSize: 24,
    text: 'Thin serif cutouts\nScene remains visible',
    rotation: 17,
  };
  reference.scale(4.2, 4.2);
  renderDrawingObject(reference, object, { x: 0, y: 0 });
  context.scale(4.2, 4.2);
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
  try {
    renderDrawingObject(context, object, { x: 0, y: 0 });
    expect(getContext).toHaveBeenCalledTimes(1);
    const scratch = getContext.mock.contexts[0];
    if (!(scratch instanceof HTMLCanvasElement)) throw new Error('Expected scratch canvas');
    expect(scratch.width).toBeLessThanOrEqual(context.canvas.width);
    expect(scratch.height).toBeLessThanOrEqual(context.canvas.height);
    const actual = context.getImageData(0, 0, 500, 500).data;
    const expected = reference.getImageData(0, 0, 500, 500).data;
    let backgroundPixels = 0;
    let mismatchedPixels = 0;
    for (let offset = 0; offset < actual.length; offset += 4) {
      const channels = [0, 1, 2, 3];
      const background = channels.every(
        (channel) => expected[offset + channel] === [255, 136, 0, 255][channel]
      );
      const source = channels.every(
        (channel) => expected[offset + channel] === scene[offset + channel]
      );
      if (background) backgroundPixels += 1;
      if (
        (background || source) &&
        channels.some((channel) => actual[offset + channel] !== expected[offset + channel])
      )
        mismatchedPixels += 1;
    }
    expect(backgroundPixels).toBeGreaterThan(100);
    expect(mismatchedPixels).toBe(0);
    getContext.mockClear();
    renderDrawingObject(
      context,
      { ...object, bounds: { ...object.bounds, x: -2_000 } },
      { x: 0, y: 0 }
    );
    expect(getContext).not.toHaveBeenCalled();
    const afterOffscreen = context.getImageData(0, 0, 500, 500).data;
    expect(afterOffscreen.every((channel, index) => channel === actual[index])).toBe(true);
  } finally {
    getContext.mockRestore();
  }
});

it.each([
  { rotation: 17, zoom: 1.15 },
  { rotation: -31, zoom: 1.6 },
])(
  'preserves thin serif glyph cores at fractional placement with $rotation rotation and $zoom zoom',
  (settings) => {
    const context = createPixelCanvas(true);
    const mask = createPixelCanvas();
    const before = context.getImageData(0, 0, 500, 500).data;
    const object = {
      ...stencilText,
      bounds: { x: 70.35, y: 80.65, width: 250, height: 64 },
      fontSize: 24,
      text: 'Thin serif cutouts\nScene remains visible',
      rotation: settings.rotation,
    };
    for (const target of [context, mask]) target.scale(settings.zoom, settings.zoom);
    const projection = { x: 7.2, y: 11.6 };
    renderDrawingObject(mask, { ...object, color: '#ffffff', backgroundColor: null }, projection);
    renderDrawingObject(context, object, projection);
    const glyphs = mask.getImageData(0, 0, 500, 500).data;
    const after = context.getImageData(0, 0, 500, 500).data;
    let cores = 0;
    let coveredCores = 0;
    for (let offset = 0; offset < after.length; offset += 4) {
      if (glyphs[offset + 3] !== 255) continue;
      cores += 1;
      if (
        [0, 1, 2, 3].some(
          (channel) => Math.abs(after[offset + channel]! - before[offset + channel]!) > 1
        )
      )
        coveredCores += 1;
    }
    expect(cores).toBeGreaterThan(40);
    expect(coveredCores).toBe(0);
  }
);

it.each(['#223344', '#22334480'])('paints %s text normally over its background', (color) => {
  const context = createPixelCanvas();
  renderDrawingObject(context, { ...stencilText, color }, { x: 0, y: 0 });
  const pixels = context.getImageData(0, 0, 500, 500).data;
  expect(Array.from(pixels).some((channel, index) => index % 4 === 3 && channel === 255)).toBe(
    true
  );
  expect(
    Array.from(pixels).some((channel, index) => index % 4 === 0 && channel > 30 && channel < 200)
  ).toBe(true);
});

it.each(['unavailable', 'throws'])(
  'preserves scene and normal text fill when scratch context %s',
  (failure) => {
    const context = createPixelCanvas(true);
    const original = HTMLCanvasElement.prototype.getContext;
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(function (this: HTMLCanvasElement, ...args) {
        if (this === context.canvas) return Reflect.apply(original, this, args);
        if (failure === 'throws') throw new Error('Canvas allocation failed');
        return null;
      });
    try {
      expect(() => renderDrawingObject(context, stencilText, { x: 0, y: 0 })).not.toThrow();
      expect(Array.from(context.getImageData(75, 100, 1, 1).data)).toEqual([255, 136, 0, 255]);
      expect(context.globalCompositeOperation).toBe('source-over');
    } finally {
      getContext.mockRestore();
    }
  }
);

it.each(['#ff8800', '#ff880080'])('fills multiline backgrounds once with %s', (color) => {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    arcTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    measureText: (text: string) => ({ width: text.length * 10 }),
    globalAlpha: 1,
  };
  renderDrawingObject(
    context as unknown as CanvasRenderingContext2D,
    {
      id: 'rotated-text',
      kind: 'text',
      bounds: { x: 20, y: 30, width: 180, height: 100 },
      rotation: 10,
      text: 'Long line\nShort\n',
      color: '#111111',
      backgroundColor: color,
      fontFamily: 'sans',
      fontSize: 24,
    },
    { x: 0, y: 0 }
  );
  expect(context.moveTo).toHaveBeenCalledTimes(1);
  expect(context.closePath).toHaveBeenCalledTimes(1);
  expect(context.arcTo).toHaveBeenCalled();
  expect(context.beginPath).toHaveBeenCalledTimes(1);
  expect(context.fill).toHaveBeenCalledTimes(1);
  expect(context.fillText).toHaveBeenCalledTimes(3);
});

it.each([0, 5, 10, 45])('has continuous captured background pixels at %s degrees', (angle) => {
  for (const color of ['#ff8800', '#ff880080']) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 400;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#808080';
    context.fillRect(0, 0, 400, 400);
    const radians = (angle * Math.PI) / 180;
    renderDrawingObject(
      context,
      {
        id: 'pixel-proof',
        kind: 'text',
        bounds: { x: 110, y: 150, width: 180, height: 100 },
        rotation: angle,
        text: 'Longer first line\nShort\nLast',
        color: '#00000000',
        backgroundColor: color,
        fontFamily: 'sans',
        fontSize: 24,
      },
      { x: 0, y: 0 }
    );
    context.fillStyle = color;
    context.fillRect(0, 0, 5, 5);
    const expected = context.getImageData(1, 1, 1, 1).data;
    for (const edge of [182, 212]) {
      for (let offset = 20; offset <= 30; offset += 1) {
        for (const delta of [-0.75, -0.25, 0.25, 0.75]) {
          const localX = 110 + offset - 200;
          const localY = edge + delta - 200;
          const pixel = context.getImageData(
            Math.floor(200 + localX * Math.cos(radians) - localY * Math.sin(radians)),
            Math.floor(200 + localX * Math.sin(radians) + localY * Math.cos(radians)),
            1,
            1
          ).data;
          expect(
            Array.from(pixel).every((channel, index) => Math.abs(channel - expected[index]!) <= 2),
            `${color} edge=${edge} offset=${offset}`
          ).toBe(true);
        }
      }
    }
  }
});

it.each(['rectangle', 'ellipse', 'triangle'] as const)(
  'preserves handles and omits only the rectangle selection perimeter for %s',
  (kind) => {
    const context = createPixelCanvas();
    renderDrawingSelection(
      context,
      {
        kind,
        id: 'shape-selection',
        bounds: { x: 80, y: 90, width: 200, height: 100 },
        color: '#111111',
        fillColor: null,
        width: 4,
      },
      { x: 0, y: 0 }
    );
    const perimeter = context.getImageData(100, 89, 50, 3).data;
    expect(perimeter.some((channel, index) => index % 4 === 3 && channel > 0)).toBe(
      kind !== 'rectangle'
    );
    for (const [x, y] of [
      [80, 90],
      [180, 90],
      [280, 90],
      [280, 140],
      [280, 190],
      [180, 190],
      [80, 190],
      [80, 140],
    ]) {
      expect(context.getImageData(x!, y!, 1, 1).data[3]).toBeGreaterThan(0);
    }
    expect(
      context
        .getImageData(289, 73, 16, 16)
        .data.some((channel, index) => index % 4 === 3 && channel > 0)
    ).toBe(true);
  }
);
