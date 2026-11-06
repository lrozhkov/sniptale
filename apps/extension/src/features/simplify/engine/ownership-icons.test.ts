import { createCanvas } from 'canvas';
import { expect, it, vi } from 'vitest';
import type { SimplifyPixelSource } from '../raster';

type Box = {
  x: number;
  y: number;
  w: number;
  h: number;
  bg: number[];
  shape: string;
  kind?: string;
  contrast?: number;
  textConfidence?: boolean;
  roleEvidence?: string;
  typeMetrics?: { xHeight?: number; glyphBounds?: { x: number; y: number; w: number; h: number } };
  sourceRuns?: [number, number, number][];
};
const { claimCaptionedFigures } = await vi.importActual<{
  claimCaptionedFigures(
    image: SimplifyPixelSource,
    boxes: Box[],
    protectedRects?: Box[],
    boundaries?: Box[]
  ): Box[];
}>('./ownership-icons.mjs');
const { resolveForegroundClaims } = await vi.importActual<{
  resolveForegroundClaims(
    image: SimplifyPixelSource,
    boxes: Box[],
    measure: () => null,
    background: () => number[],
    protectedRects?: Box[],
    boundaries?: Box[]
  ): Box[];
}>('./ownership.mjs');
const { render, DEFAULTS } = await vi.importActual<{
  render(ctx: unknown, source: unknown, catalog: Box[], settings: object): void;
  DEFAULTS: object;
}>('./render.mjs');

function fixture(shape = 'text', mode = 'figure') {
  const width = 130,
    height = 140,
    data = new Uint8ClampedArray(width * height * 4).fill(255);
  const fill = (x: number, y: number, w: number, h: number, rgb: number[]) => {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) data.set([...rgb, 255], (yy * width + xx) * 4);
  };
  const boxes: Box[] = [];
  for (let row = 0; row < 3; row++) {
    const y = 10 + 40 * row,
      role = row === 2 ? shape : 'icon';
    fill(20, y, 24, 24, [20, 80, 190]);
    if (row < 2 || mode === 'figure') fill(24, y + 4, 16, 16, [255, 255, 255]);
    if (row === 2 && mode === 'inset') {
      fill(20, y, 24, 24, [255, 255, 255]);
      fill(23, y + 3, 18, 18, [20, 80, 190]);
    }
    if (row === 2 && mode === 'short') {
      fill(20, y, 24, 24, [255, 255, 255]);
      fill(20, y + 8, 24, 8, [20, 80, 190]);
    }
    const short = row === 2 && mode === 'short';
    boxes.push({
      x: 20,
      y: short ? y + 8 : y,
      w: 24,
      h: short ? 8 : 24,
      bg: [255, 255, 255],
      shape: role,
      kind: 'auto',
      contrast: 200,
      textConfidence: role === 'text',
      typeMetrics: { glyphBounds: { x: 20, y, w: 24, h: short ? 8 : 20 } },
    });
    boxes.push({
      x: 64,
      y: y + 6,
      w: 44,
      h: 12,
      bg: [255, 255, 255],
      shape: 'text',
      contrast: 200,
      textConfidence: true,
      typeMetrics: { xHeight: 8 },
    });
  }
  return { image: { width, height, data }, boxes, fill };
}
const claimed = (boxes: Box[]) => boxes.some((b) => b.roleEvidence === 'captioned-figure-family');
const bg = () => [255, 255, 255];

it('preserves the captioned figure in text mode and replaces it in all mode', () => {
  const { image, boxes } = fixture();
  const catalog = resolveForegroundClaims(image, boxes, () => null, bg);
  expect(catalog.find((b) => b.roleEvidence === 'captioned-figure-family')?.shape).toBe('icon');
  const source = createCanvas(image.width, image.height),
    context = source.getContext('2d');
  const pixels = context.createImageData(image.width, image.height);
  pixels.data.set(image.data);
  context.putImageData(pixels, 0, 0);
  const output = createCanvas(image.width, image.height),
    out = output.getContext('2d');
  render(out, source, catalog, { ...DEFAULTS, content: 'text' });
  const text = out.getImageData(20, 90, 24, 24).data,
    original = context.getImageData(20, 90, 24, 24).data;
  expect([...text]).toEqual([...original]);
  render(out, source, catalog, { ...DEFAULTS, content: 'all' });
  expect([...out.getImageData(20, 90, 24, 24).data]).not.toEqual([...original]);
});

it.each([
  ['text', 'figure', true],
  ['image', 'figure', true],
  ['text', 'short', false],
  ['image', 'filled', false],
  ['image', 'inset', false],
] as const)('classifies %s with %s source', (shape, mode, expected) => {
  const { image, boxes } = fixture(shape, mode);
  expect(claimed(claimCaptionedFigures(image, boxes))).toBe(expected);
});

it('preserves separate owners, frame boundaries, and a shared enclosing panel', () => {
  const { image, boxes } = fixture();
  const icon: Box = { x: 42, y: 90, w: 12, h: 12, shape: 'icon', bg: bg() };
  expect(claimed(claimCaptionedFigures(image, [...boxes, icon]))).toBe(false);
  const control: Box = { x: 18, y: 88, w: 30, h: 28, shape: 'unknown', bg: bg() };
  expect(claimed(claimCaptionedFigures(image, boxes, [], [control]))).toBe(false);
  const panel: Box = { x: 0, y: 0, w: 120, h: 130, shape: 'unknown', bg: bg() };
  expect(claimed(claimCaptionedFigures(image, boxes, [panel], [panel]))).toBe(true);
});

it('requires anchors in distinct rows and a regular slot family', () => {
  const { image, boxes } = fixture();
  const sameRow = boxes.map((b, i) => (i === 2 ? { ...b, y: 10 } : b));
  expect(claimed(claimCaptionedFigures(image, sameRow))).toBe(false);
  const irregular = boxes.map((b, i) => (i >= 4 ? { ...b, y: b.y + 20 } : b));
  expect(claimed(claimCaptionedFigures(image, irregular))).toBe(false);
  const gutter = boxes.map((b, i) => (i === 4 ? { ...b, x: 3 } : b));
  expect(claimed(claimCaptionedFigures(image, gutter))).toBe(false);
});

it('enforces the background fraction and consumes detached source runs', () => {
  for (const [background, expected] of [
    [144, true],
    [143, false],
  ] as const) {
    const { image, boxes } = fixture('text', 'filled');
    for (let n = 0; n < background; n++)
      image.data.set(
        [255, 255, 255, 255],
        ((90 + Math.floor(n / 24)) * image.width + 20 + (n % 24)) * 4
      );
    expect(claimed(claimCaptionedFigures(image, boxes))).toBe(expected);
  }
  const { image, boxes, fill } = fixture();
  fill(25, 87, 14, 5, [230, 20, 20]);
  boxes.push({ x: 25, y: 87, w: 14, h: 5, bg: bg(), shape: 'unknown' });
  const result = claimCaptionedFigures(image, boxes),
    owner = result.find((b) => b.roleEvidence === 'captioned-figure-family');
  expect(result.some((b) => b.shape === 'unknown')).toBe(false);
  expect(owner?.sourceRuns?.some(([y, x, w]) => y === 87 && x <= 25 && x + w >= 39)).toBe(true);
});

it.each([
  [28, 18],
  [24, 16],
  [16, 28],
] as const)('uses a common replacement size for a %i by %i figure and its peers', (w, h) => {
  const { image, boxes } = fixture();
  boxes[4] = { ...boxes[4]!, x: w === 16 ? 24 : 20, w, h };
  const result = claimCaptionedFigures(image, boxes);
  const icons = result.filter((b) => b.shape === 'icon');
  expect(icons).toHaveLength(3);
  expect(icons.map((b) => [b.w, b.h])).toEqual([
    [20, 20],
    [20, 20],
    [20, 20],
  ]);
});

it('leaves all-icon families unchanged and blocks expansion into text or a frame', () => {
  const { image, boxes } = fixture();
  boxes[4] = { ...boxes[4]!, shape: 'icon' };
  expect(claimCaptionedFigures(image, boxes)).toEqual(boxes);
  boxes[4] = { ...boxes[4]!, shape: 'text', h: 16 };
  const obstacle: Box = {
    x: 20,
    y: 87,
    w: 18,
    h: 3,
    shape: 'text',
    textConfidence: true,
    bg: bg(),
  };
  const blocked = claimCaptionedFigures(image, [...boxes, obstacle]);
  expect(blocked.find((b) => b.roleEvidence === 'captioned-figure-family')?.h).toBe(16);
  const frame: Box = { ...obstacle, shape: 'unknown' };
  expect(
    claimCaptionedFigures(image, boxes, [], [frame]).find(
      (b) => b.roleEvidence === 'captioned-figure-family'
    )?.h
  ).toBe(16);
});

it('merges a centered overlapping small icon into its family anchor', () => {
  const { image, boxes, fill } = fixture();
  fill(27, 8, 8, 8, [230, 20, 20]);
  boxes.push({ x: 27, y: 8, w: 8, h: 8, bg: bg(), shape: 'icon' });
  const result = claimCaptionedFigures(image, boxes);
  expect(result.filter((b) => b.shape === 'icon')).toHaveLength(3);
  const anchor = result.find((b) => b.shape === 'icon' && b.y < 20);
  expect(anchor?.sourceRuns?.some(([y, x, w]) => y === 8 && x <= 27 && x + w >= 35)).toBe(true);
});

it('preserves detached anchor ink outside the normalized slot', () => {
  const { image, boxes, fill } = fixture();
  fill(20, 10, 24, 24, [255, 255, 255]);
  fill(27, 17, 10, 10, [20, 80, 190]);
  fill(20, 10, 1, 3, [20, 80, 190]);
  const catalog = resolveForegroundClaims(image, boxes, () => null, bg);
  const source = createCanvas(image.width, image.height),
    context = source.getContext('2d');
  const pixels = context.createImageData(image.width, image.height);
  pixels.data.set(image.data);
  context.putImageData(pixels, 0, 0);
  const output = createCanvas(image.width, image.height),
    out = output.getContext('2d');
  const original = [...context.getImageData(20, 10, 24, 24).data];
  render(out, source, catalog, { ...DEFAULTS, content: 'text' });
  expect([...out.getImageData(20, 10, 24, 24).data]).toEqual(original);
  render(out, source, catalog, { ...DEFAULTS, content: 'all' });
  const painted = out.getImageData(20, 10, 1, 3).data;
  for (let i = 0; i < painted.length; i += 4)
    expect([...painted.slice(i, i + 3)]).not.toEqual([20, 80, 190]);
});
