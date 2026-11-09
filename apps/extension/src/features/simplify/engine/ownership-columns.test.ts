import { createCanvas } from 'canvas';
import { expect, it, vi } from 'vitest';

type Rect = { x: number; y: number; w: number; h: number };
type Raster = { width: number; height: number; data: Uint8ClampedArray };
type Metric = { glyphs: number; xHeight: number; stroke: number; glyphBounds: Rect };
type Box = Rect & {
  shape: string;
  bg: number[];
  textConfidence?: boolean;
  typeMetrics?: Metric;
  textSize?: number;
  roleEvidence?: string;
};
const { glyphMetrics } = await vi.importActual<{
  glyphMetrics(image: Raster, box: Rect & { bg: number[] }, minimum?: number): Metric | null;
}>('./detector.mjs');
const { recoverColumnGlyphs } = await vi.importActual<{
  recoverColumnGlyphs(
    image: Raster,
    input: Box[],
    narrow: Box[],
    protectedRects: Rect[],
    measure: typeof glyphMetrics
  ): Box[];
}>('./ownership-columns.mjs');

function fixture(values = ['1', '2', '3', '5'], color = '#0064bf') {
  const canvas = createCanvas(520, 380),
    context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 520, 380);
  context.font = '20px monospace';
  context.textBaseline = 'top';
  context.fillStyle = '#0064bf';
  for (const row of [0, 4]) context.fillText('93281007', 130, 20 + row * 45);
  const rows = [1, 2, 3, 5];
  rows.forEach((row, i) => {
    context.fillStyle = i === 3 ? color : '#0064bf';
    context.fillText(values[i]!, 130, 20 + row * 45);
  });
  context.fillStyle = '#0064bf';
  context.fillText('1', 410, 20);
  const image = context.getImageData(0, 0, 520, 380),
    bg = [255, 255, 255];
  const anchors: Box[] = [0, 4].map((row) => {
    const bounds = { x: 128, y: 18 + row * 45, w: 120, h: 28, bg };
    const metric = glyphMetrics(image, bounds);
    expect(metric?.glyphs).toBeGreaterThan(3);
    return { ...bounds, shape: 'text', textConfidence: true, typeMetrics: metric!, textSize: 20 };
  });
  const candidates: Box[] = rows.map((row) => ({
    x: 128,
    y: 18 + row * 45,
    w: 18,
    h: 28,
    bg,
    shape: 'unknown',
  }));
  return { image, anchors, candidates, input: [...anchors, ...candidates] };
}
function claim(
  f: ReturnType<typeof fixture>,
  input = f.input,
  protectedRects: Rect[] = [],
  narrow: Box[] = []
) {
  return recoverColumnGlyphs(f.image, input, narrow, protectedRects, glyphMetrics);
}
const admitted = (boxes: Box[]) => boxes.filter((b) => b.roleEvidence === 'text-column');

it('claims varied single-character values, including one absent from the font anchors', () => {
  const f = fixture();
  expect(admitted(claim(f))).toHaveLength(4);
  expect(f.candidates.every((b) => b.shape === 'unknown')).toBe(true);
});
it('claims repeated values when every source glyph has independent font witnesses', () => {
  const f = fixture(['0', '0', '0', '0']);
  expect(admitted(claim(f))).toHaveLength(4);
});
it.each([0, 1])('does not infer a column from only %s text anchors', (count) => {
  const f = fixture(),
    input = [...f.anchors.slice(0, count), ...f.candidates];
  expect(claim(f, input)).toEqual(input);
});
it('preserves protected and explicitly owned controls rather than borrowing their family', () => {
  const f = fixture();
  expect(admitted(claim(f, f.input, [f.candidates[3]!]))).toHaveLength(0);
  const input = [
    ...f.anchors,
    ...f.candidates.map((b, i) =>
      i === 3 ? { ...b, shape: 'icon', roleEvidence: 'control-icon' } : b
    ),
  ];
  expect(claim(f, input)).toEqual(input);
});
it('does not borrow unrelated ink or arbitrary aligned shapes as font evidence', () => {
  const different = fixture(undefined, '#dc2626');
  expect(admitted(claim(different))).toHaveLength(0);
  const shapes = fixture(['+', '+', '+', '+']);
  expect(admitted(claim(shapes))).toHaveLength(0);
});
it('does not publish unmatched narrow evidence or count duplicate evidence as more rows', () => {
  const f = fixture(),
    extra: Box = { x: 408, y: 18, w: 18, h: 28, bg: [255, 255, 255], shape: 'unknown' };
  const result = claim(f, f.input, [], [extra, extra]);
  expect(result).toHaveLength(f.input.length);
  expect(admitted(result)).toHaveLength(4);
  const duplicateOnly = [...f.anchors, ...f.candidates.slice(0, 2)];
  expect(
    admitted(
      claim(f, duplicateOnly, [], [...f.candidates.slice(0, 2), ...f.candidates.slice(0, 2)])
    )
  ).toHaveLength(0);
});
