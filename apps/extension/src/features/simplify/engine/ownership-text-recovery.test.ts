import { expect, it, vi } from 'vitest';
import type { SimplifyPixelSource } from '../raster';
type Bounds = { x: number; y: number; w: number; h: number; bg: number[] };
const { computeGlyphMetricsAt } = await vi.importActual<{
  computeGlyphMetricsAt(
    image: SimplifyPixelSource,
    box: Bounds,
    minimum: number,
    luminance: boolean,
    factor: number
  ): object | null;
}>('./detector-glyphs.mjs');
const { recoverWeakMediaText, mergeRecoveredTextRows } = await vi.importActual<{
  mergeRecoveredTextRows(
    image: SimplifyPixelSource,
    boxes: object[],
    measure: (image: SimplifyPixelSource, box: Bounds, minimum?: number) => object | null,
    protectedRects: object[]
  ): Array<{ x: number; w: number; shape: string }>;
  recoverWeakMediaText(
    image: SimplifyPixelSource,
    boxes: object[],
    measure: (image: SimplifyPixelSource, box: Bounds, minimum?: number) => object | null,
    protectedRects: object[]
  ): Array<{ x: number; shape: string }>;
}>('./ownership-text-recovery.mjs');
it('uses glyph bodies rather than detached dots to recover adjacent text fragments', () => {
  const width = 180,
    height = 60;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const mark = (x: number, y: number, w: number, h: number) => {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) data.set([25, 25, 25, 255], (yy * width + xx) * 4);
  };
  for (const x of [10, 25, 40, 55, 77]) {
    mark(x, 30, 2, 12);
    mark(x, 40, 8, 2);
  }
  mark(82, 23, 2, 3);
  mark(87, 30, 2, 12);
  mark(87, 40, 10, 2);
  mark(95, 30, 2, 12);
  mark(87, 30, 10, 2);
  mark(130, 30, 10, 12);
  for (let y = 30; y < 42; y++)
    for (let x = 87; x < 97; x++) {
      const k = (y * width + x) * 4;
      if (data[k] === 25) data[k + 1] = 75;
    }
  data[(30 * width + 87) * 4 + 1] = 25;
  const source = { width, height, data };
  const measure = (image: SimplifyPixelSource, box: Bounds, minimum = 1) =>
    computeGlyphMetricsAt(image, box, minimum, false, 0.35);
  const prefix = {
    x: 10,
    y: 20,
    w: 75,
    h: 24,
    bg: [255, 255, 255],
    shape: 'text',
    textConfidence: true,
    typeMetrics: measure(source, { x: 10, y: 20, w: 75, h: 24, bg: [255, 255, 255] }, 1),
  };
  const fragment = {
    x: 87,
    y: 30,
    w: 10,
    h: 12,
    bg: [255, 255, 255],
    shape: 'image',
    kind: 'small-image-group',
  };
  const unrelated = { ...fragment, x: 130 };
  const result = recoverWeakMediaText(source, [prefix, fragment, unrelated], measure, []);
  expect(result.find((b) => b.x === 87)?.shape).toBe('text');
  expect(result.find((b) => b.x === 130)?.shape).toBe('image');
  const merged = mergeRecoveredTextRows(source, result, measure, []);
  expect(merged.find((b) => b.x === 10)?.w).toBe(87);
});
