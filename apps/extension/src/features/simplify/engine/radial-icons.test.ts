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
  roleEvidence?: string;
  sourceRuns?: number[][];
};
const { claimRadialIcons } = await vi.importActual<{
  claimRadialIcons(
    image: SimplifyPixelSource,
    input: Box[],
    measure: () => null | { glyphs: number; baselineAgreement: number; heightAgreement: number },
    options?: { protected: (Box & { kind: string })[] }
  ): Box[];
}>('./radial-icons.mjs');
const { render, DEFAULTS } = await vi.importActual<{
  render(ctx: unknown, source: unknown, catalog: Box[], settings: object): void;
  DEFAULTS: object;
}>('./render.mjs');

function fixture(core = true, incomplete = false) {
  const width = 90,
    height = 70,
    bg = [16, 20, 24];
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([...bg, 255], i * 4);
  const mark = (x: number, y: number, color = [180, 90, 40]) =>
    data.set([...color, 255], (y * width + x) * 4);
  for (let y = 12; y <= 46; y++)
    for (let x = 18; x <= 52; x++) {
      const r = Math.hypot(x - 35, y - 29),
        a = Math.atan2(y - 29, x - 35);
      if (r < 13 || r > 17 || Math.abs(a + 0.65) < 0.11 || Math.abs(a + 2.49) < 0.11) continue;
      if (incomplete && x < 30 && y > 29) continue;
      mark(x, y, y < 20 ? [190, 45, 40] : [35, 125, 180]);
    }
  if (core)
    for (let y = 24; y <= 34; y++)
      for (let x = 30; x <= 40; x++)
        if (Math.abs(x - 35) <= 1 || y === 24) mark(x, y, [45, 150, 90]);
  const top: Box = { x: 20, y: 10, w: 31, h: 16, bg, shape: 'unknown' };
  const body: Box = {
    x: 16,
    y: 17,
    w: 39,
    h: 32,
    bg,
    shape: 'icon',
    roleEvidence: 'structured-symbol',
  };
  return { source: { width, height, data }, top, body, mark };
}

it('claims detached arcs and an enclosed glyph from one complete bounded contour', () => {
  const { source, top, body } = fixture();
  for (const input of [
    [top, body],
    [body, top],
  ]) {
    const result = claimRadialIcons(source, input, () => null);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      shape: 'icon',
      roleEvidence: 'segmented-annulus',
      x: 18,
      y: 12,
      w: 35,
      h: 35,
    });
    expect(result[0]!.sourceRuns?.some(([y, x, n]) => y === 29 && x! <= 35 && x! + n! > 35)).toBe(
      true
    );
  }
});
it('keeps text-only rendering of a complete segmented symbol identical to its source', () => {
  const { source, top, body } = fixture();
  const input = createCanvas(source.width, source.height),
    ctx = input.getContext('2d');
  const pixels = ctx.createImageData(source.width, source.height);
  pixels.data.set(source.data);
  ctx.putImageData(pixels, 0, 0);
  const output = createCanvas(source.width, source.height);
  render(
    output.getContext('2d'),
    input,
    claimRadialIcons(source, [top, body], () => null),
    { ...DEFAULTS, content: 'text' }
  );
  expect(output.getContext('2d').getImageData(0, 0, source.width, source.height).data).toEqual(
    source.data
  );
});
it('requires complete angular coverage before replacing an established icon owner', () => {
  const { source, top, body } = fixture(true, true);
  expect(claimRadialIcons(source, [top, body], () => null)).toEqual([top, body]);
});
it('keeps a nearby caret as a distinct owner', () => {
  const { source, top, body, mark } = fixture();
  for (let y = 27; y < 30; y++) for (let x = 60 + y - 27; x <= 66 - (y - 27); x++) mark(x, y);
  const caret: Box = { x: 60, y: 27, w: 7, h: 3, bg: top.bg, shape: 'unknown' };
  const result = claimRadialIcons(source, [top, body, caret], () => null);
  expect(result).toHaveLength(2);
  expect(result).toContain(caret);
  expect(result.filter((b) => b.roleEvidence === 'segmented-annulus')).toHaveLength(1);
});
it('does not absorb a protected overlap or a different established graphic owner', () => {
  const { source, top, body } = fixture();
  expect(
    claimRadialIcons(source, [top, body], () => null, { protected: [{ ...top, kind: 'media' }] })
  ).toEqual([top, body]);
  const graphic = { ...body, roleEvidence: 'layered-contours' };
  expect(claimRadialIcons(source, [top, graphic], () => null)).toEqual([top, graphic]);
});

it('recognizes an empty segmented ring without an enclosed glyph', () => {
  const { source, top, body } = fixture(false);
  const result = claimRadialIcons(source, [top, body], () => null);
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ shape: 'icon', roleEvidence: 'segmented-annulus' });
});
it('does not reinterpret a single closed letter or a Q-like tail without an icon peer', () => {
  const { source, top } = fixture(false);
  source.data.fill(0);
  for (let y = 0; y < source.height; y++)
    for (let x = 0; x < source.width; x++) {
      const r = Math.hypot(x - 35, y - 29);
      source.data.set(
        [...(r >= 13 && r <= 17 ? [180, 180, 180] : top.bg), 255],
        (y * source.width + x) * 4
      );
    }
  const proposal = { ...top, x: 16, y: 10, w: 39, h: 39 };
  expect(claimRadialIcons(source, [proposal], () => null)).toEqual([proposal]);
  for (let d = 7; d <= 17; d++)
    source.data.set([180, 180, 180, 255], ((29 + d) * source.width + 35 + d) * 4);
  expect(claimRadialIcons(source, [proposal], () => null)).toEqual([proposal]);
});
it('retains typography that competes with a segmented contour', () => {
  const { source, top, body } = fixture();
  const measure = () => ({ glyphs: 3, baselineAgreement: 1, heightAgreement: 1 });
  expect(claimRadialIcons(source, [top, body], measure)).toEqual([top, body]);
});

it('retains a caret inside the same proposal as a separate residual', () => {
  const { source, top, mark } = fixture();
  for (let y = 27; y < 30; y++) for (let x = 54 + y - 27; x <= 58 - (y - 27); x++) mark(x, y);
  const proposal = { ...top, x: 18, y: 12, w: 41, h: 35 };
  const result = claimRadialIcons(source, [proposal], () => null);
  expect(result).toHaveLength(2);
  expect(result.find((b) => b.roleEvidence === 'segmented-annulus')).toMatchObject({
    x: 18,
    y: 12,
    w: 35,
    h: 35,
  });
  expect(result.find((b) => b.roleEvidence === 'radial-residual')).toMatchObject({
    x: 54,
    y: 27,
    w: 5,
    h: 3,
    shape: 'unknown',
  });
});
