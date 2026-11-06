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
const media = vi.hoisted(() => ({ surfaces: [] as Box[], graphics: [] as Box[] }));
vi.mock('./media-surfaces.mjs', async (original) => ({
  ...(await original<object>()),
  detectSurfaces: () => media.surfaces,
}));
vi.mock('./media-components.mjs', async (original) => ({
  ...(await original<object>()),
  detectGraphics: () => media.graphics,
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

beforeEach(() => {
  media.surfaces = [];
  media.graphics = [];
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
