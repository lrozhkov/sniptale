import { expect, it, vi } from 'vitest';
import type { SimplifyPixelSource } from '../raster';
type Box = {
  x: number;
  y: number;
  w: number;
  h: number;
  bg: number[];
  shape?: string;
  componentCount?: number;
  eraseRuns?: number[][];
};
type Metrics = {
  glyphs: number;
  foregroundCoverage: number;
  glyphBounds: { x: number; y: number; w: number; h: number };
};
const { glyphMetrics } = await vi.importActual<{
  glyphMetrics(image: SimplifyPixelSource, box: Box, minimum?: number): Metrics | null;
}>('./detector.mjs');
const { refineTextStructure } = await vi.importActual<{
  refineTextStructure(
    image: SimplifyPixelSource,
    boxes: Box[],
    measure: typeof glyphMetrics
  ): Box[];
}>('./structure.mjs');
const bg = [16, 20, 24];
function raster(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([...bg, 255], i * 4);
  return { width, height, data };
}
function rect(
  image: SimplifyPixelSource,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number[]
) {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) image.data.set([...color, 255], (yy * image.width + xx) * 4);
}
function letter(image: SimplifyPixelSource, x: number, y: number, color: number[]) {
  rect(image, x, y, 5, 2, color);
  rect(image, x, y + 6, 5, 2, color);
  rect(image, x, y, 2, 8, color);
  rect(image, x + 3, y, 2, 8, color);
}
it('uses an independent luminance measurement when a partial word is geometrically coherent', () => {
  const image = raster(84, 20),
    ink = [110, 160, 230];
  for (const x of [5, 14, 23, 32, 41, 50]) {
    rect(image, x, 2, 5, 2, ink);
    rect(image, x, 15, 5, 2, ink);
    rect(image, x, 2, 2, 15, ink);
    rect(image, x + 3, 2, 2, 15, ink);
  }
  for (const x of [62, 71]) letter(image, x, 5, ink);
  for (let x = 5; x < 55; x++) {
    const i = (8 * image.width + x) * 4;
    if (image.data[i] === bg[0]) image.data.set([16, 20, 110, 255], i);
  }
  const metrics = glyphMetrics(image, { x: 2, y: 2, w: 78, h: 15, bg });
  expect(metrics?.glyphs).toBeGreaterThanOrEqual(8);
  expect(metrics?.foregroundCoverage).toBeGreaterThan(0.9);
  expect(metrics?.glyphBounds.x).toBe(5);
});
it('splits caption lines after a neighboring graphic is extracted', () => {
  const image = raster(170, 60),
    ink = [100, 150, 230],
    graphic = [190, 55, 45];
  rect(image, 5, 10, 24, 2, graphic);
  rect(image, 5, 40, 24, 2, graphic);
  rect(image, 5, 10, 2, 32, graphic);
  rect(image, 27, 10, 2, 32, graphic);
  for (const y of [8, 32]) for (let x = 40; x < 144; x += 8) letter(image, x, y, ink);
  const result = refineTextStructure(
    image,
    [{ x: 2, y: 4, w: 148, h: 42, bg, shape: 'text', componentCount: 27 }],
    glyphMetrics
  );
  expect(result.filter((b) => b.shape === 'icon')).toHaveLength(1);
  expect(result.filter((b) => b.shape === 'text')).toHaveLength(2);
});

it('recovers coherent glyphs on a bordered colored surface', async () => {
  const { buildDetectionCatalog } = await vi.importActual<{
    buildDetectionCatalog(image: SimplifyPixelSource): Box[];
  }>('./detector.mjs');
  const image = raster(130, 40);
  rect(image, 20, 10, 54, 18, [11, 108, 66]);
  rect(image, 21, 11, 52, 16, [16, 44, 36]);
  for (let x = 24; x < 68; x += 7) {
    rect(image, x, 15, 5, 1, [0, 255, 136]);
    rect(image, x, 22, 5, 1, [0, 255, 136]);
    rect(image, x, 15, 1, 8, [0, 255, 136]);
    rect(image, x + 4, 15, 1, 8, [0, 255, 136]);
  }
  const catalog = buildDetectionCatalog(image);
  const label = catalog.find((box) => box.shape === 'text' && box.x < 30 && box.x + box.w > 65);
  expect(label?.bg).toEqual([16, 44, 36]);
  expect(label?.eraseRuns?.length).toBeGreaterThan(0);
  expect(
    label?.eraseRuns?.every(([y, x, w]) => y! > 10 && y! < 27 && x! > 20 && x! + w! <= 73)
  ).toBe(true);
});

it('preserves an empty capsule and solid geometric marks', async () => {
  const { buildDetectionCatalog } = await vi.importActual<{
    buildDetectionCatalog(image: SimplifyPixelSource): Box[];
  }>('./detector.mjs');
  for (const graphic of [false, true]) {
    const image = raster(130, 40);
    rect(image, 20, 10, 54, 18, [11, 108, 66]);
    rect(image, 21, 11, 52, 16, [16, 44, 36]);
    if (graphic) for (const x of [28, 40, 52]) rect(image, x, 14, 7, 9, [0, 255, 136]);
    expect(buildDetectionCatalog(image).some((box) => box.shape === 'text')).toBe(false);
  }
});
