import { expect, it } from 'vitest';
import { createRasterBrushStroke } from './brush';
import type { RasterSourceGeometry } from './contracts';
import { composeRasterRegion, paintRasterVisibility, type RasterPixelData } from './pixels';

function fixture(width = 40, height = 20) {
  const planes: RasterPixelData = {
    width,
    height,
    color: new Uint8ClampedArray(width * height * 4).fill(255),
    visibility: null,
    key: null,
  };
  const geometry: RasterSourceGeometry = {
    width,
    height,
    crop: { x: 0, y: 0, width, height },
    sourceToScene: [1, 0, 0, 1, 0, 0],
    periodic: false,
  };
  return { planes, geometry, diameter: 4, hardness: 1, mode: 'erase' as const };
}

it('stamps a click immediately with source-pixel diameter independent of scene transforms', () => {
  const options = fixture();
  const transformed = {
    ...options,
    geometry: { ...options.geometry, sourceToScene: [0, 3, -0.5, 1, 400, 50] as const },
  };
  const stroke = createRasterBrushStroke(options);
  const first = stroke.add({ x: 12.5, y: 10.5 });
  expect(first.coverage[10 * 40 + 12]).toBe(255);
  expect(first.coverage[10 * 40 + 15]).toBe(0);
  const final = stroke.finish();
  const second = createRasterBrushStroke(transformed);
  second.add({ x: 12.5, y: 10.5 });
  expect(second.finish().coverage).toEqual(final.coverage);
  expect(final.planes).toEqual(paintRasterVisibility(options.planes, final.coverage, false));
  expect(final.pixels).toEqual(composeRasterRegion(final.planes, final.dirtyBounds!));
});

it('fills a fast long stroke with no gaps and freezes its final endpoint synchronously', () => {
  const options = fixture(500, 10);
  const stroke = createRasterBrushStroke({ ...options, diameter: 2 });
  stroke.add({ x: 1.5, y: 5.5 });
  stroke.add({ x: 250.5, y: 5.5 });
  const result = stroke.finish({ x: 498.5, y: 5.5 });
  for (let x = 1; x <= 498; x++) expect(result.coverage[5 * 500 + x]).toBe(255);
  const frozen = result.coverage.slice();
  expect(() => stroke.add({ x: 300, y: 6 })).toThrow('closed');
  expect(result.coverage).toEqual(frozen);
});

it('separates hardness from diameter and preserves all accepted source planes', () => {
  const options = fixture();
  const original = options.planes.color.slice();
  const hard = createRasterBrushStroke({ ...options, diameter: 10 });
  const soft = createRasterBrushStroke({ ...options, diameter: 10, hardness: 0 });
  hard.add({ x: 15.5, y: 10.5 });
  soft.add({ x: 15.5, y: 10.5 });
  const a = hard.finish();
  const b = soft.finish();
  expect(a.coverage[10 * 40 + 18]).toBe(255);
  expect(b.coverage[10 * 40 + 18]).toBeGreaterThan(0);
  expect(b.coverage[10 * 40 + 18]).toBeLessThan(255);
  expect(b.coverage[10 * 40 + 15]).toBe(255);
  expect(options.planes.color).toEqual(original);
  expect(options.planes.visibility).toBeNull();
});

it('clamps every changed pixel to explicit selection and working crop', () => {
  const options = fixture();
  const selection = new Uint8Array(800);
  selection.fill(255, 10 * 40 + 5, 10 * 40 + 18);
  const stroke = createRasterBrushStroke({
    ...options,
    selection,
    diameter: 30,
    geometry: { ...options.geometry, crop: { x: 10, y: 5, width: 4, height: 10 } },
  });
  stroke.add({ x: 12, y: 10 });
  const result = stroke.finish();
  for (let i = 0; i < 800; i++) if (result.coverage[i]) expect(i >= 410 && i <= 413).toBe(true);
  expect(result.coverage.some((v) => v > 0)).toBe(true);
});

it('wraps periodic seam stamps without drawing a shortcut across the tile center', () => {
  const options = fixture(20, 10);
  const stroke = createRasterBrushStroke({
    ...options,
    diameter: 2,
    geometry: { ...options.geometry, periodic: true },
  });
  stroke.add({ x: 19.5, y: 5.5 });
  const result = stroke.finish({ x: 21.5, y: 5.5 });
  expect(result.coverage[5 * 20 + 19]).toBe(255);
  expect(result.coverage[5 * 20]).toBe(255);
  expect(result.coverage[5 * 20 + 1]).toBe(255);
  expect(result.coverage[5 * 20 + 10]).toBe(0);
});

it('clips periodic stamps to document bounds before modulo', () => {
  const options = fixture(20, 10);
  const stroke = createRasterBrushStroke({
    ...options,
    geometry: {
      ...options.geometry,
      periodic: true,
      sceneClip: { x: 20, y: 0, width: 5, height: 10 },
    },
    diameter: 20,
  });
  stroke.add({ x: 20, y: 5 });
  const result = stroke.finish();
  for (let i = 0; i < 200; i++) if (result.coverage[i]) expect(i % 20 < 5).toBe(true);
});

it('restores visibility and key strength against the pure pixel oracle without input mutation', () => {
  const options = fixture();
  const visibility = new Uint8Array(800).fill(35);
  const key = new Uint8ClampedArray(3200).fill(80);
  const planes = { ...options.planes, visibility, key };
  const stroke = createRasterBrushStroke({ ...options, planes, mode: 'restore', hardness: 0 });
  stroke.add({ x: 12, y: 10 });
  const result = stroke.finish({ x: 17, y: 10 });
  expect(result.planes).toEqual(paintRasterVisibility(planes, result.coverage, true));
  expect(visibility.every((v) => v === 35)).toBe(true);
  expect(key.every((v) => v === 80)).toBe(true);
});

it('cancels without changing source planes and rejects later input', () => {
  const options = fixture();
  const stroke = createRasterBrushStroke(options);
  stroke.add({ x: 10, y: 10 });
  stroke.cancel();
  expect(options.planes.visibility).toBeNull();
  expect(options.planes.key).toBeNull();
  expect(() => stroke.finish()).toThrow('closed');
  expect(() => stroke.add({ x: 12, y: 12 })).toThrow('closed');
});

it('rejects invalid settings before touching accepted input', () => {
  expect(() => createRasterBrushStroke({ ...fixture(), diameter: Infinity })).toThrow('diameter');
  expect(() => createRasterBrushStroke({ ...fixture(), hardness: -1 })).toThrow('hardness');
});

it('folds periodic coverage into the cropped period instead of the full retained source', () => {
  const options = fixture(20, 10);
  const stroke = createRasterBrushStroke({
    ...options,
    diameter: 2,
    geometry: { ...options.geometry, periodic: true, crop: { x: 5, y: 2, width: 8, height: 6 } },
  });
  stroke.add({ x: 12.5, y: 4.5 });
  const result = stroke.finish({ x: 14.5, y: 4.5 });
  expect(result.coverage[4 * 20 + 12]).toBe(255);
  expect(result.coverage[4 * 20 + 5]).toBe(255);
  expect(result.coverage[4 * 20 + 6]).toBe(255);
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 20; x++)
      if (x < 5 || x >= 13 || y < 2 || y >= 8) expect(result.coverage[y * 20 + x]).toBe(0);
});

it('refuses periodic samples outside the native render rectangle before wrapping', () => {
  const options = fixture(20, 10);
  const geometry = {
    ...options.geometry,
    periodic: true,
    sourceClip: { x: 20, y: 0, width: 5, height: 10 },
  };
  const stroke = createRasterBrushStroke({ ...options, geometry, diameter: 2 });
  stroke.add({ x: 10.5, y: 5.5 });
  expect(stroke.finish().coverage.some((v) => v > 0)).toBe(false);
});
