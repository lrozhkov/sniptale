import { expect, it, vi } from 'vitest';
import type { SimplifyPixelSource } from '../raster';
const { detectSurfaces, alignMediaSurfaceRows } = await vi.importActual<{
  detectSurfaces(image: SimplifyPixelSource): object[];
  alignMediaSurfaceRows(
    image: SimplifyPixelSource,
    surfaces: Array<{ x: number; y: number; w: number; h: number }>
  ): void;
}>('./media-surfaces.mjs');

it('bounds pixel work for repeated text borders around an unrelated texture seed', () => {
  const width = 256,
    height = 256;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) pixels.set([248, 248, 248, 255], p * 4);
  for (let y = 32; y < 224; y += 16)
    for (let yy = y; yy < y + 6; yy++)
      for (let x = 20; x < 244; x++)
        if (x % 8 < 5) pixels.set([45, 45, 45, 255], (yy * width + x) * 4);
  let seed = 17;
  for (let y = 96; y < 192; y++)
    for (let x = 136; x < 232; x++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      pixels.set([seed & 255, (seed >>> 8) & 255, (seed >>> 16) & 255, 255], (y * width + x) * 4);
    }
  let reads = 0;
  // Budget channel reads instead of wall time; this allows several whole-raster
  // passes but excludes repeated area scans for unsupported border pairs.
  const data = new Proxy(pixels, {
    get(target, key) {
      if (typeof key === 'string' && /^\d+$/.test(key) && ++reads > width * height * 64)
        throw new Error('Surface analysis exceeded its pixel-work budget.');
      return Reflect.get(target, key, target);
    },
  });
  detectSurfaces({ width, height, data });
  expect(reads).toBeLessThanOrEqual(width * height * 64);
});

it('keeps a textured image boundary separate from neighboring text across a narrow gutter', () => {
  const width = 400,
    height = 220;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  let seed = 13;
  for (let y = 32; y < 160; y++)
    for (let x = 32; x < 160; x++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data.set(
        [32 + (seed & 127), 32 + ((seed >>> 8) & 127), 32 + ((seed >>> 16) & 127), 255],
        (y * width + x) * 4
      );
    }
  for (let y = 32; y < 160; y += 20)
    for (let yy = y; yy < y + 10; yy++)
      for (let x = 172; x < 372; x++)
        if (x % 10 < 7) data.set([30, 30, 30, 255], (yy * width + x) * 4);
  const surfaces = detectSurfaces({ width, height, data });
  expect(surfaces).toHaveLength(1);
  const [surface] = surfaces as Array<{
    x: number;
    y: number;
    w: number;
    h: number;
  }>;
  expect(Math.abs(surface!.x - 32)).toBeLessThanOrEqual(2);
  expect(Math.abs(surface!.y - 32)).toBeLessThanOrEqual(2);
  expect(Math.abs(surface!.w - 128)).toBeLessThanOrEqual(3);
  expect(Math.abs(surface!.h - 128)).toBeLessThanOrEqual(3);
});

it('aligns a large picture to its hard edge instead of the neighboring soft shadow', () => {
  const width = 400,
    height = 300,
    data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 40; y < 216; y++)
    for (let x = 50; x < 350; x++) {
      const color =
        y < 200 ? [30, 60, 90] : [150 + (y - 200) * 6, 150 + (y - 200) * 6, 150 + (y - 200) * 6];
      data.set([...color, 255], (y * width + x) * 4);
    }
  const surfaces = [{ x: 50, y: 40, w: 300, h: 176 }];
  alignMediaSurfaceRows({ width, height, data }, surfaces);
  expect(surfaces[0]!.h).toBe(160);
});

it('covers the source top scanline when a large picture proposal starts one row inside it', () => {
  const width = 400,
    height = 300,
    data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 40; y < 200; y++)
    for (let x = 50; x < 350; x++) data.set([30, 60, 90, 255], (y * width + x) * 4);
  const surfaces = [{ x: 50, y: 41, w: 300, h: 159 }];
  alignMediaSurfaceRows({ width, height, data }, surfaces);
  expect(surfaces[0]).toEqual({ x: 50, y: 40, w: 300, h: 160 });
});

it('keeps raster-clipped picture boundaries when no exterior scanline exists', () => {
  const width = 400,
    height = 300,
    data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      data.set(y % 2 ? [220, 220, 220, 255] : [30, 30, 30, 255], (y * width + x) * 4);
  const surfaces = [{ x: 0, y: 0, w: width, h: height }];
  alignMediaSurfaceRows({ width, height, data }, surfaces);
  expect(surfaces[0]).toEqual({ x: 0, y: 0, w: width, h: height });
});
