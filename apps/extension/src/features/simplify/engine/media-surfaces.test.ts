import { expect, it, vi } from 'vitest';
import type { SimplifyPixelSource } from '../raster';
const { detectSurfaces } = await vi.importActual<{
  detectSurfaces(image: SimplifyPixelSource): object[];
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
  expect(detectSurfaces({ width, height, data })).toEqual([]);
});
