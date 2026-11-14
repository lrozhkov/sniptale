import { expect, it } from 'vitest';
import { createSourceImageFilter } from './contract';
import { applySourceImageFilters } from './reference';
const stack = (filters: ReturnType<typeof createSourceImageFilter>[]) => ({ version: 1, filters });
it('preserves exact straight RGBA for neutral and disabled stacks without taking ownership', () => {
  const source = new Uint8ClampedArray([17, 43, 91, 0, 64, 128, 192, 128]),
    before = source.slice();
  const result = applySourceImageFilters(
    source,
    2,
    1,
    stack([createSourceImageFilter('color', 'identity')])
  );
  expect(result).toEqual(before);
  expect(result).not.toBe(source);
  expect(source).toEqual(before);
});
it('matches analytic exposure and saturation while preserving alpha and immutable source', () => {
  const filter = createSourceImageFilter('color', 'color');
  if (filter.kind !== 'color') throw Error();
  filter.parameters.exposure = 1;
  const source = new Uint8ClampedArray([32, 64, 96, 128]);
  expect([...applySourceImageFilters(source, 1, 1, stack([filter]))]).toEqual([64, 128, 192, 128]);
  filter.parameters.exposure = 0;
  filter.parameters.saturation = 0;
  const gray = applySourceImageFilters(source, 1, 1, stack([filter]));
  expect([...gray]).toEqual([60, 60, 60, 128]);
  expect([...source]).toEqual([32, 64, 96, 128]);
});
it('clamps blurred edge samples and keeps constant premultiplied images constant', () => {
  const source = new Uint8ClampedArray(
    Array.from({ length: 16 }, () => [70, 140, 210, 128]).flat()
  );
  expect(
    applySourceImageFilters(source, 4, 4, stack([createSourceImageFilter('blur', 'blur')]))
  ).toEqual(source);
});
it('preserves authored order and reproducibility on a nonuniform static image', () => {
  const source = new Uint8ClampedArray([
    40, 80, 120, 255, 90, 130, 180, 255, 210, 155, 80, 64, 180, 40, 100, 255,
  ]);
  const color = createSourceImageFilter('color', 'color');
  if (color.kind !== 'color') throw Error();
  color.parameters.contrast = 2;
  const blur = createSourceImageFilter('blur', 'blur');
  const a = applySourceImageFilters(source, 4, 1, stack([color, blur]));
  expect(a).not.toEqual(applySourceImageFilters(source, 4, 1, stack([blur, color])));
  expect(applySourceImageFilters(source, 4, 1, stack([color, blur]))).toEqual(a);
});
it('gives transparent bloom valid coverage instead of hidden RGB with zero alpha', () => {
  const source = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
  const result = applySourceImageFilters(
    source,
    3,
    1,
    stack([createSourceImageFilter('bloom', 'bloom')])
  );
  expect(result[7]).toBeGreaterThan(0);
  expect(result[11]).toBeGreaterThan(0);
  expect(result[3]).toBe(255);
});
it('refuses wrong dimensions and unsupported formats before allocating working pixels', () => {
  expect(() => applySourceImageFilters(new Uint8ClampedArray(4), 2, 2, stack([]))).toThrow();
  expect(() =>
    applySourceImageFilters(new Uint8ClampedArray(4), 1, 1, { version: 9, filters: [] })
  ).toThrow();
});

it.each(['blur', 'bloom'] as const)(
  'requires neighboring source pixels for %s instead of filtering only a cropped demand',
  (kind) => {
    const full = new Uint8ClampedArray(
      Array.from({ length: 24 * 8 }, (_, pixel) =>
        pixel % 24 >= 16 ? [255, 255, 255, 255] : [0, 0, 0, 255]
      ).flat()
    );
    const cropped = new Uint8ClampedArray(
      Array.from({ length: 8 * 8 }, () => [0, 0, 0, 255]).flat()
    );
    const filter = createSourceImageFilter(kind, kind);
    if (filter.kind !== 'blur' && filter.kind !== 'bloom')
      throw new Error('Expected a spatial filter.');
    filter.parameters.radius = 1;
    const filteredFull = applySourceImageFilters(full, 24, 8, stack([filter]));
    const filteredCrop = applySourceImageFilters(cropped, 8, 8, stack([filter]));
    expect(filteredFull[(4 * 24 + 15) * 4]).toBeGreaterThan(0);
    expect(filteredCrop[(4 * 8 + 7) * 4]).toBe(0);
    expect(full[(4 * 24 + 15) * 4]).toBe(0);
  }
);

it('matches analytic monochrome and sepia values while retaining partial alpha', () => {
  const source = new Uint8ClampedArray([100, 150, 199, 128]);
  const gray = applySourceImageFilters(
    source,
    1,
    1,
    stack([createSourceImageFilter('monochrome', 'gray')])
  );
  expect([...gray]).toEqual([143, 143, 143, 128]);
  const sepia = applySourceImageFilters(
    source,
    1,
    1,
    stack([createSourceImageFilter('sepia', 'sepia')])
  );
  expect([...sepia]).toEqual([192, 171, 133, 128]);
});
it('uses one clamped block-center sample for pixelation and a source-logical radial vignette', () => {
  const source = new Uint8ClampedArray([0, 0, 0, 255, 100, 100, 100, 255]);
  const filter = createSourceImageFilter('pixelate', 'pixel');
  if (filter.kind !== 'pixelate') throw new Error('Expected pixelate');
  filter.parameters.size = 2;
  expect([...applySourceImageFilters(source, 2, 1, stack([filter]))]).toEqual([
    50, 50, 50, 255, 50, 50, 50, 255,
  ]);
  const white = new Uint8ClampedArray(
    Array.from({ length: 25 }, () => [255, 255, 255, 255]).flat()
  );
  const vignette = applySourceImageFilters(
    white,
    5,
    5,
    stack([createSourceImageFilter('vignette', 'vignette')])
  );
  expect(vignette[0]).toBe(128);
  expect(vignette[(2 * 5 + 2) * 4]).toBe(255);
  expect(vignette[3]).toBe(255);
});
it('sharpens a bounded impulse without changing coverage or producing hidden RGB', () => {
  const source = new Uint8ClampedArray([10, 10, 10, 128, 70, 70, 70, 128, 10, 10, 10, 128]);
  const result = applySourceImageFilters(
    source,
    3,
    1,
    stack([createSourceImageFilter('sharpen', 'sharp')])
  );
  expect([...result]).toEqual([0, 0, 0, 128, 190, 190, 190, 128, 0, 0, 0, 128]);
});
it('repeats grain by project time and seed after arbitrary seek ordering and keeps source data unchanged', () => {
  const source = new Uint8ClampedArray(
      Array.from({ length: 16 }, () => [128, 128, 128, 128]).flat()
    ),
    before = source.slice(),
    grain = createSourceImageFilter('grain', 'grain');
  if (grain.kind !== 'grain') throw new Error('Expected grain');
  grain.parameters.amount = 0.5;
  const render = (time: number) =>
    applySourceImageFilters(source, 4, 4, stack([grain]), { width: 4, height: 4 }, time);
  const first = render(0.2);
  expect(render(0.8)).not.toEqual(first);
  expect(render(0.2)).toEqual(first);
  expect(render(0.2001)).toEqual(first);
  grain.parameters.seed++;
  expect(render(0.2)).not.toEqual(first);
  expect(source).toEqual(before);
  for (let p = 3; p < first.length; p += 4) expect(first[p]).toBe(128);
});
