import { describe, expect, it } from 'vitest';
import { findRegion } from './region';
import {
  assertRasterPixelData,
  composeRasterPixels,
  composeRasterRegion,
  fillRasterRegion,
  hideRasterRegion,
  paintRasterVisibility,
  removeRasterColor,
  type RasterPixelData,
} from './pixels';

function planes(...rgba: number[]): RasterPixelData {
  return {
    width: rgba.length / 4,
    height: 1,
    color: new Uint8ClampedArray(rgba),
    visibility: null,
    key: null,
  };
}

describe('immutable retained raster planes', () => {
  it('validates dimensions, typed arrays, binary masks and soft coverage before mutations', () => {
    const source = planes(20, 30, 40, 255);
    expect(() => assertRasterPixelData({ ...source, width: 32769 })).toThrow(RangeError);
    expect(() => assertRasterPixelData({ ...source, width: 10001, height: 10000 })).toThrow(
      RangeError
    );
    expect(() => assertRasterPixelData({ ...source, color: new Uint8ClampedArray(3) })).toThrow(
      TypeError
    );
    expect(() => assertRasterPixelData({ ...source, visibility: new Uint8Array(2) })).toThrow(
      TypeError
    );
    expect(() => assertRasterPixelData({ ...source, key: new Uint8ClampedArray(3) })).toThrow(
      TypeError
    );
    expect(() => fillRasterRegion(source, new Uint8Array([1]), [0, 0, 0, 255])).toThrow(RangeError);
    expect(() => hideRasterRegion(source, new Uint8Array([128]))).toThrow(RangeError);
    expect(() => removeRasterColor(source, new Uint8Array([255]), [256, 0, 0])).toThrow(RangeError);
    expect(() => paintRasterVisibility(source, new Uint8Array(2), false)).toThrow(TypeError);
    expect(paintRasterVisibility(source, new Uint8Array([128]), false).visibility).toEqual(
      new Uint8Array([127])
    );
    expect(source).toEqual(planes(20, 30, 40, 255));
  });

  it('fills only the region and resets visibility/key without replacing unchanged planes', () => {
    const source = {
      ...planes(10, 20, 30, 255, 90, 80, 70, 120),
      visibility: new Uint8Array([0, 12]),
      key: new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 80]),
    };
    const before = structuredClone(source);
    const filled = fillRasterRegion(source, new Uint8Array([255, 0]), [40, 50, 60, 90]);
    expect([...filled.color]).toEqual([40, 50, 60, 90, 90, 80, 70, 120]);
    expect([...filled.visibility!]).toEqual([255, 12]);
    expect([...filled.key!]).toEqual([255, 255, 255, 0, 0, 0, 0, 80]);
    expect(source).toEqual(before);
    expect(fillRasterRegion(filled, new Uint8Array([255, 0]), [40, 50, 60, 90])).toBe(filled);
    expect(fillRasterRegion(source, new Uint8Array(2), [1, 2, 3, 255])).toBe(source);
    const colorOnly = fillRasterRegion(planes(0, 0, 0, 255), new Uint8Array([255]), [1, 2, 3, 255]);
    expect(colorOnly.visibility).toBeNull();
    expect(colorOnly.key).toBeNull();
  });

  it('erases and restores visibility and key strength without changing accepted color', () => {
    const source = {
      ...planes(100, 120, 130, 200, 1, 2, 3, 255),
      key: new Uint8ClampedArray([255, 255, 255, 200, 0, 0, 0, 0]),
    };
    const erased = hideRasterRegion(source, new Uint8Array([255, 0]));
    expect(erased.color).toBe(source.color);
    expect(erased.key).toBe(source.key);
    expect([...erased.visibility!]).toEqual([0, 255]);
    expect(hideRasterRegion(erased, new Uint8Array([255, 0]))).toBe(erased);
    const soft = paintRasterVisibility(erased, new Uint8Array([128, 0]), true);
    expect(soft.color).toBe(source.color);
    expect([...soft.visibility!]).toEqual([128, 255]);
    expect(soft.key![3]).toBe(100);
    const restored = paintRasterVisibility(soft, new Uint8Array([255, 0]), true);
    expect(composeRasterPixels(restored)).toEqual(source.color);
    expect(paintRasterVisibility(restored, new Uint8Array([255, 0]), true)).toBe(restored);
    expect(paintRasterVisibility(source, new Uint8Array(2), false)).toBe(source);
  });

  it('composes arbitrary keys, partial strength, source alpha and visibility', () => {
    const source = {
      ...planes(150, 100, 50, 128),
      visibility: new Uint8Array([128]),
      key: new Uint8ClampedArray([200, 100, 0, 255]),
    };
    expect([...composeRasterPixels(source)]).toEqual([0, 100, 200, 16]);
    const muted = { ...planes(21, 81, 179, 255), key: new Uint8ClampedArray([255, 255, 255, 12]) };
    expect([...composeRasterPixels(muted)]).toEqual([20, 80, 179, 254]);
    expect([...composeRasterPixels(planes(7, 19, 251, 0))]).toEqual([0, 0, 0, 0]);
    const hidden = hideRasterRegion(planes(70, 90, 110, 255), new Uint8Array([255]));
    expect([...composeRasterPixels(hidden)]).toEqual([0, 0, 0, 0]);
    expect([...hidden.color]).toEqual([70, 90, 110, 255]);
  });

  it('clips the separate band to explicit selection and image bounds, including empty selection', () => {
    const source = planes(
      255,
      255,
      255,
      255,
      220,
      220,
      220,
      255,
      128,
      128,
      128,
      255,
      12,
      12,
      12,
      255
    );
    const region = new Uint8Array([255, 0, 0, 0]);
    const result = removeRasterColor(
      source,
      region,
      [255, 255, 255],
      new Uint8Array([255, 255, 0, 255])
    );
    expect(result.color).toBe(source.color);
    expect(result.visibility).toBe(source.visibility);
    expect(result.key![3]).toBe(255);
    expect(result.key![7]).toBe(255);
    expect(result.key![11]).toBe(0);
    expect(result.key![15]).toBe(0);
    expect(removeRasterColor(source, region, [255, 255, 255], new Uint8Array(4))).toBe(source);
    expect(removeRasterColor(source, new Uint8Array(4), [255, 255, 255])).toBe(source);
    expect(
      removeRasterColor(result, region, [255, 255, 255], new Uint8Array([255, 255, 0, 255]))
    ).toBe(result);
    expect([...source.color]).toEqual([
      255, 255, 255, 255, 220, 220, 220, 255, 128, 128, 128, 255, 12, 12, 12, 255,
    ]);
  });

  it('preserves already transparent source edges and hidden RGB while removing selected key pixels', () => {
    const source = planes(
      255,
      255,
      255,
      255,
      90,
      120,
      180,
      128,
      200,
      40,
      100,
      0,
      255,
      255,
      255,
      90
    );
    const result = removeRasterColor(source, new Uint8Array([255, 0, 0, 255]), [255, 255, 255]);
    expect([...composeRasterPixels(result)]).toEqual([
      0, 0, 0, 0, 90, 120, 180, 128, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(result.color).toBe(source.color);
    expect(result.key![7]).toBe(0);
    expect(result.key![11]).toBe(0);
  });
});

describe('bounded removal quality', () => {
  it('recovers controlled matted edges on arbitrary keys within two composite bytes', () => {
    for (const key of [
      [255, 255, 255],
      [230, 190, 130],
    ] as const) {
      const width = 15;
      const height = 9;
      const color = new Uint8ClampedArray(width * height * 4);
      const truth = new Uint8ClampedArray(color.length);
      const alphas = [0, 0, 64, 128, 255, 255, 255, 255, 255, 255, 255, 128, 64, 0, 0];
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const p = (y * width + x) * 4;
          const alpha = alphas[x]!;
          const foreground = [20, 80, 180];
          for (let c = 0; c < 3; c++) {
            color[p + c] = Math.round((foreground[c]! * alpha) / 255 + key[c]! * (1 - alpha / 255));
            truth[p + c] = foreground[c]!;
          }
          color[p + 3] = 255;
          truth[p + 3] = alpha;
        }
      const region = new Uint8Array(width * height);
      for (let i = 0; i < region.length; i++) if (alphas[i % width]! <= 64) region[i] = 255;
      const result = composeRasterPixels(
        removeRasterColor({ width, height, color, visibility: null, key: null }, region, key)
      );
      for (const backing of [
        [0, 0, 0],
        [8, 22, 50],
        [45, 180, 95],
        [240, 235, 220],
      ]) {
        for (let p = 0; p < result.length; p += 4)
          for (let c = 0; c < 3; c++) {
            const actual = Math.round(
              (result[p + c]! * result[p + 3]!) / 255 + backing[c]! * (1 - result[p + 3]! / 255)
            );
            const expected = Math.round(
              (truth[p + c]! * truth[p + 3]!) / 255 + backing[c]! * (1 - truth[p + 3]! / 255)
            );
            // Independent lossless logo fixtures measured a maximum of two composite bytes.
            expect(Math.abs(actual - expected)).toBeLessThanOrEqual(2);
          }
      }
    }
  });

  it('does not double JPEG chroma damage at a controlled foreground corner', () => {
    const color = new Uint8ClampedArray(7 * 7 * 4);
    for (let i = 0; i < 49; i++)
      color.set(i < 7 ? [255, 255, 255, 255] : [232, 48, 32, 255], i * 4);
    // Decoded source samples from the independent JPEG92 triangle corner.
    color.set([148, 82, 84, 255], 17 * 4);
    color.set([168, 126, 130, 255], 18 * 4);
    const region = new Uint8Array(49);
    region.fill(255, 0, 7);
    const source = { width: 7, height: 7, color, visibility: null, key: null };
    const result = removeRasterColor(source, region, [255, 255, 255]);
    const output = composeRasterPixels(result);
    // Source red already lost 84 bytes. Removal adds at most two at this opaque sample.
    for (let c = 0; c < 3; c++)
      expect(
        Math.abs(Math.round((output[68 + c]! * output[71]!) / 255) - color[68 + c]!)
      ).toBeLessThanOrEqual(2);
    // The adjacent reference coverage is 191; source luma retains that edge within two bytes.
    expect(Math.abs(output[75]! - 191)).toBeLessThanOrEqual(2);
    expect(result.color).toBe(color);
  });

  it('does not preserve repeated near-key compression noise as an opaque chromatic anchor', () => {
    const source = planes(
      255,
      255,
      255,
      255,
      254,
      255,
      253,
      255,
      254,
      255,
      253,
      255,
      254,
      255,
      253,
      255
    );
    const result = composeRasterPixels(
      removeRasterColor(source, new Uint8Array([255, 255, 255, 255]), [255, 255, 255])
    );
    expect(result[7]).toBe(2);
    expect(result[11]).toBe(2);
    expect(result[15]).toBe(2);
  });
});

describe('remove-color region boundaries', () => {
  it('preserves an opaque repeated gray one-pixel line beside matched white', () => {
    const color = new Uint8ClampedArray(9 * 3 * 4).fill(255);
    for (let x = 1; x < 8; x++) color.set([128, 128, 128, 255], (9 + x) * 4);
    const source = { width: 9, height: 3, color, visibility: null, key: null };
    const region = findRegion({
      ...source,
      rgba: color,
      seed: { x: 0, y: 0 },
      tolerance: 51,
      grow: 0,
      contiguous: true,
    });
    const result = composeRasterPixels(removeRasterColor(source, region, [255, 255, 255]));
    for (let x = 1; x < 8; x++)
      expect([...result.slice((9 + x) * 4, (9 + x) * 4 + 4)]).toEqual([128, 128, 128, 255]);
  });

  it('preserves an exact-key island disconnected from contiguous search by a one-pixel boundary', () => {
    const color = new Uint8ClampedArray(7 * 7 * 4).fill(255);
    for (let y = 1; y < 6; y++)
      for (let x = 1; x < 6; x++)
        if (x === 1 || x === 5 || y === 1 || y === 5) color.set([0, 0, 0, 255], (y * 7 + x) * 4);
    const source = { width: 7, height: 7, color, visibility: null, key: null };
    const region = findRegion({
      ...source,
      rgba: color,
      seed: { x: 0, y: 0 },
      tolerance: 0,
      grow: 0,
      contiguous: true,
    });
    const output = composeRasterPixels(removeRasterColor(source, region, [255, 255, 255]));
    expect([...output.slice((2 * 7 + 2) * 4, (2 * 7 + 2) * 4 + 4)]).toEqual([255, 255, 255, 255]);
    expect([...output.slice(0, 4)]).toEqual([0, 0, 0, 0]);
    expect(source.color).toBe(color);
  });
});

describe('bounded raster composition', () => {
  it('equals the full composed slice for keys, visibility and source alpha', () => {
    const source = {
      ...planes(
        150,
        100,
        50,
        128,
        7,
        19,
        251,
        0,
        40,
        70,
        100,
        255,
        21,
        81,
        179,
        255,
        10,
        20,
        30,
        255,
        80,
        90,
        100,
        255
      ),
      width: 3,
      height: 2,
      visibility: new Uint8Array([128, 255, 0, 255, 99, 255]),
      key: new Uint8ClampedArray([
        200, 100, 0, 255, 0, 0, 0, 0, 255, 255, 255, 80, 255, 255, 255, 12, 0, 0, 0, 0, 255, 255,
        255, 255,
      ]),
    };
    const before = structuredClone(source);
    const full = composeRasterPixels(source);
    const roi = composeRasterRegion(source, { x: 1, y: 0, width: 2, height: 2 });
    expect([...roi]).toEqual([...full.slice(4, 12), ...full.slice(16, 24)]);
    expect([...roi.slice(0, 8)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(source).toEqual(before);
    expect(roi.buffer).not.toBe(source.color.buffer);
  });

  it('zero-fills out-of-image cells and rejects invalid windows before allocation', () => {
    const source = planes(30, 40, 50, 255, 9, 8, 7, 0);
    const roi = composeRasterRegion(source, { x: -1, y: -1, width: 4, height: 3 });
    expect(roi.length).toBe(48);
    expect([...roi.slice(20, 24)]).toEqual([30, 40, 50, 255]);
    expect([...roi.slice(24, 28)]).toEqual([0, 0, 0, 0]);
    expect(roi.filter((_, i) => i < 20 || i >= 24)).toEqual(new Uint8ClampedArray(44));
    expect(composeRasterRegion(source, { x: 100, y: 100, width: 2, height: 2 })).toEqual(
      new Uint8ClampedArray(16)
    );
    for (const bounds of [
      { x: 0.5, y: 0, width: 1, height: 1 },
      { x: 0, y: NaN, width: 1, height: 1 },
      { x: 0, y: 0, width: 0, height: 1 },
      { x: 0, y: 0, width: 32769, height: 1 },
      { x: Number.MAX_SAFE_INTEGER, y: 0, width: 2, height: 1 },
    ])
      expect(() => composeRasterRegion(source, bounds)).toThrow(RangeError);
  });

  it('composes a one-pixel window without copying the full source color plane', () => {
    const color = new Uint8ClampedArray(1024 * 1024 * 4);
    color.set([17, 28, 39, 255], (512 * 1024 + 512) * 4);
    const slice = color.slice;
    color.slice = () => {
      throw new Error('Full source copies are not window composition');
    };
    const source = { width: 1024, height: 1024, color, visibility: null, key: null };
    expect([...composeRasterRegion(source, { x: 512, y: 512, width: 1, height: 1 })]).toEqual([
      17, 28, 39, 255,
    ]);
    color.slice = slice;
  });
});

it('copies raw RGBA without aliasing and clears hidden RGB exactly like region composition', () => {
  const source = planes(33, 44, 55, 0, 11, 22, 33, 128, 99, 88, 77, 255);
  const output = composeRasterPixels(source);
  expect(output).toEqual(composeRasterRegion(source, { x: 0, y: 0, width: 3, height: 1 }));
  expect(output).toEqual(new Uint8ClampedArray([0, 0, 0, 0, 11, 22, 33, 128, 99, 88, 77, 255]));
  output[4] = 200;
  expect(source.color[4]).toBe(11);
});
