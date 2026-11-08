import { readFile } from 'node:fs/promises';
import { createCanvas, loadImage } from 'canvas';
import { beforeEach, expect, it, vi } from 'vitest';
import type { SimplifyPixelSource } from '../raster';

type Box = {
  x: number;
  y: number;
  w: number;
  h: number;
  shape: string;
  bg: number[];
  typeMetrics?: { xHeight: number };
};
const media = vi.hoisted(() => ({
  surfaces: [] as Box[],
  graphics: [] as Box[],
  frames: [] as Box[],
}));
vi.mock('./media-surfaces.mjs', async (original) => ({
  ...(await original<object>()),
  detectSurfaces: () => media.surfaces,
}));
vi.mock('./media-components.mjs', async (original) => ({
  ...(await original<object>()),
  detectGraphics: () => media.graphics,
}));
vi.mock('./media-frames.mjs', async (original) => ({
  ...(await original<object>()),
  detectClippedFramedImages: () => media.frames,
}));
const { uncertainColorTexture } = await vi.importActual<{
  uncertainColorTexture(image: SimplifyPixelSource, box: Box): boolean;
}>('./compact-textures.mjs');
const { detectMedia } = await vi.importActual<{
  detectMedia(image: SimplifyPixelSource, measure: null): Box[];
}>('./media.mjs');

function image(width: number, height: number, bg: number[]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) data.set([...bg, 255], p * 4);
  return { width, height, data };
}
function mark(source: SimplifyPixelSource, x: number, y: number, rgb: number[]) {
  source.data.set([...rgb, 255], (y * source.width + x) * 4);
}
const background = [16, 20, 24];
const ink = [136, 163, 232];
function thinColoredComponent(source: SimplifyPixelSource) {
  for (let y = 0; y < 7; y++)
    for (let x = 0; x < 6; x++) {
      if (x !== 0 && x !== 5 && y !== 0 && y !== 6 && y !== 3) continue;
      const color = x === 2 && y === 0 ? ink : (x + y) % 2 ? [136, 20, 232] : [16, 163, 232];
      mark(source, x + 10, y + 4, color);
    }
}
const text: Box = {
  x: 0,
  y: 0,
  w: 100,
  h: 18,
  bg: background,
  shape: 'text',
  typeMetrics: { xHeight: 7 },
};

it('accepts a thin subpixel component only with independent same-ink interiors', () => {
  const source = image(100, 20, background);
  thinColoredComponent(source);
  for (const left of [30, 45])
    for (let y = 4; y < 11; y++) for (let x = left; x < left + 6; x++) mark(source, x, y, ink);
  expect(uncertainColorTexture(source, text)).toBe(false);
});
it('keeps a coreless multicolor graphic uncertain without same-ink witnesses', () => {
  const source = image(100, 20, background);
  thinColoredComponent(source);
  expect(uncertainColorTexture(source, text)).toBe(true);
});
it('does not borrow white text interiors to accept a saturated graphic', () => {
  const source = image(100, 20, background);
  thinColoredComponent(source);
  for (const left of [30, 45])
    for (let y = 4; y < 11; y++)
      for (let x = left; x < left + 6; x++) mark(source, x, y, [230, 230, 230]);
  expect(uncertainColorTexture(source, text)).toBe(true);
});

function subpixelGlyph(source: SimplifyPixelSource, left: number, reverse = false) {
  const rows = ['101010', '101010', '101010', '111110', '101010', '101010', '101010'];
  const sample = (x: number, y: number) => (x >= 0 && x < 6 && rows[y]![x] === '1' ? 220 : 0);
  for (let y = 0; y < rows.length; y++)
    for (let x = -1; x <= 6; x++) {
      const red = sample(x - 1, y),
        blue = sample(x, y);
      const channels = reverse ? [blue, (red + blue) / 2, red] : [red, (red + blue) / 2, blue];
      mark(
        source,
        left + x,
        y + 4,
        channels.map((v, c) => v + background[c]!)
      );
    }
}

it.each([false, true])(
  'accepts independent same-phase subpixel glyphs (reversed: %s)',
  (reverse) => {
    const source = image(100, 20, background);
    for (const left of [10, 30, 50]) subpixelGlyph(source, left, reverse);
    expect(uncertainColorTexture(source, text)).toBe(false);
  }
);

it('keeps an interpolated-color graphic uncertain without independent same-phase witnesses', () => {
  const source = image(100, 20, background);
  subpixelGlyph(source, 10);
  expect(uncertainColorTexture(source, text)).toBe(true);
});

it('does not use opposite-phase glyphs as witnesses', () => {
  const source = image(100, 20, background);
  subpixelGlyph(source, 10);
  subpixelGlyph(source, 30, true);
  subpixelGlyph(source, 50, true);
  expect(uncertainColorTexture(source, text)).toBe(true);
});

beforeEach(() => {
  media.surfaces = [];
  media.graphics = [];
  media.frames = [];
});
const white = [255, 255, 255];
function box(x: number, y: number, w: number, h: number): Box {
  return { x, y, w, h, shape: 'image', bg: white };
}
it('keeps a connected graphic whole when a texture surface crosses it', () => {
  const graphic = box(100, 80, 160, 180);
  media.graphics = [graphic];
  media.surfaces = [box(110, 170, 140, 180)];
  expect(detectMedia(image(400, 400, white), null)).toEqual([graphic]);
});
it('keeps an enclosing surface as the sole media owner', () => {
  const surface = box(100, 80, 180, 200);
  media.graphics = [box(110, 100, 140, 150)];
  media.surfaces = [surface];
  expect(detectMedia(image(400, 400, white), null)).toEqual([surface]);
});
it('absorbs a texture surface inside a complete connected graphic', () => {
  const graphic = box(100, 80, 180, 200);
  media.graphics = [graphic];
  media.surfaces = [box(100, 80, 180, 170)];
  expect(detectMedia(image(400, 400, white), null)).toEqual([graphic]);
});

it('gives a complete clipped frame ownership over a contained partial surface', () => {
  const frame = box(90, 190, 180, 210);
  media.frames = [frame];
  media.surfaces = [box(100, 200, 140, 200)];
  expect(detectMedia(image(400, 400, white), null)).toEqual([frame]);
});

it.each(['original', 'reversed-fringe', 'recolored'] as const)(
  'accepts a small colored subpixel notice with independent glyph witnesses: %s',
  async (variant) => {
    const raster = await loadImage(
      await readFile(new URL('../fixtures/subpixel-colored-notice.png', import.meta.url))
    );
    const canvas = createCanvas(raster.width, raster.height);
    canvas.getContext('2d').drawImage(raster, 0, 0);
    const image = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const bg = [...background];
    if (variant === 'reversed-fringe') {
      [bg[0], bg[2]] = [bg[2]!, bg[0]!];
      for (let i = 0; i < image.data.length; i += 4)
        [image.data[i], image.data[i + 2]] = [image.data[i + 2]!, image.data[i]!];
    } else if (variant === 'recolored') {
      const gains = [1.4, 0.8, 0.65];
      for (let i = 0; i < image.data.length; i += 4)
        for (let c = 0; c < 3; c++)
          image.data[i + c] = Math.round(bg[c]! + (image.data[i + c]! - bg[c]!) * gains[c]!);
    }
    const box: Box = {
      x: 0,
      y: 0,
      w: canvas.width,
      h: canvas.height,
      bg,
      shape: 'text',
      typeMetrics: { xHeight: 6 },
    };
    expect(uncertainColorTexture(image, box)).toBe(false);
  }
);
