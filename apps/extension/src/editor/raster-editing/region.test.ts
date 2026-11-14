import { describe, expect, it } from 'vitest';
import { findRegion, type RegionOptions } from './region';
import { floodFillBits } from './vendor/flood-fill';

function options(values: readonly number[], overrides: Partial<RegionOptions> = {}): RegionOptions {
  return {
    width: values.length,
    height: 1,
    rgba: new Uint8ClampedArray(values.flatMap((value) => [value, value, value, 255])),
    seed: { x: 0, y: 0 },
    tolerance: 0,
    grow: 0,
    contiguous: true,
    ...overrides,
  };
}
const rows = (mask: Uint8Array, width: number): string[] =>
  Array.from({ length: mask.length / width }, (_, y) =>
    Array.from(mask.slice(y * width, (y + 1) * width), (value) => (value === 255 ? '#' : '.')).join(
      ''
    )
  );

describe('shared Klecks region search', () => {
  it('uses four-connected regions and all-matches mode with inclusive channel tolerance', () => {
    expect([...findRegion(options([10, 10, 20, 10]))]).toEqual([255, 255, 0, 0]);
    expect([...findRegion(options([10, 10, 20, 10], { contiguous: false }))]).toEqual([
      255, 255, 0, 255,
    ]);
    expect([...findRegion(options([10, 12, 13, 10], { tolerance: 2 }))]).toEqual([255, 255, 0, 0]);
    expect([...findRegion(options([10, 12, 13, 10], { tolerance: 2, contiguous: false }))]).toEqual(
      [255, 255, 0, 255]
    );
    expect([...findRegion(options([0, 255, 70], { tolerance: 255 }))]).toEqual([255, 255, 255]);
    const diagonal = options([0, 255, 255, 0], { width: 2, height: 2 });
    expect(rows(findRegion(diagonal), 2)).toEqual(['#.', '..']);
  });

  it('canonicalizes hidden RGB and still compares visible alpha, without changing inputs', () => {
    const rgba = new Uint8ClampedArray([255, 60, 80, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 3]);
    const before = rgba.slice();
    expect([...findRegion(options([0, 0, 0, 0], { rgba }))]).toEqual([255, 255, 0, 0]);
    expect([...findRegion(options([0, 0, 0, 0], { rgba, tolerance: 2 }))]).toEqual([
      255, 255, 255, 0,
    ]);
    expect([...findRegion(options([0, 0, 0, 0], { rgba, contiguous: false }))]).toEqual([
      255, 255, 0, 0,
    ]);
    expect(rgba).toEqual(before);
  });

  it('restricts traversal and all-matches to selection and rejects excluded seeds', () => {
    const selection = new Uint8Array([255, 0, 255, 255]);
    const before = selection.slice();
    expect([...findRegion(options([0, 0, 0, 0], { selection }))]).toEqual([255, 0, 0, 0]);
    expect([...findRegion(options([0, 0, 0, 0], { selection, contiguous: false }))]).toEqual([
      255, 0, 255, 255,
    ]);
    expect(() => findRegion(options([0, 0, 0, 0], { selection, seed: { x: 1, y: 0 } }))).toThrow(
      RangeError
    );
    expect(() => findRegion(options([0, 0, 0, 0], { selection: new Uint8Array(4) }))).toThrow(
      RangeError
    );
    expect([...findRegion(options([0, 0, 0, 0], { selection: null }))]).toEqual([
      255, 255, 255, 255,
    ]);
    expect(selection).toEqual(before);
  });

  it('clips grown regions to image edges and the explicit selection', () => {
    const original = options([0, 255, 255, 255, 255, 255, 255, 255, 255], {
      width: 3,
      height: 3,
      grow: 1,
    });
    expect(rows(findRegion(original), 3)).toEqual(['##.', '##.', '...']);
    const selection = new Uint8Array([255, 255, 0, 255, 0, 0, 0, 0, 0]);
    expect(rows(findRegion({ ...original, selection }), 3)).toEqual(['##.', '#..', '...']);
    expect(rows(findRegion({ ...original, grow: 100000 }), 3)).toEqual(['###', '###', '###']);
    expect(
      rows(
        findRegion(
          options([255, 255, 255, 255, 255, 255, 255, 255, 0], {
            width: 3,
            height: 3,
            seed: { x: 2, y: 2 },
            grow: 1,
          })
        ),
        3
      )
    ).toEqual(['...', '.##', '.##']);
    // Pixels adjacent in memory across a row boundary are not geometric neighbors.
    expect(
      rows(
        findRegion(
          options([255, 255, 0, 0, 255, 255, 255, 255, 255], {
            width: 3,
            height: 3,
            seed: { x: 2, y: 0 },
            grow: 1,
            contiguous: false,
          })
        ),
        3
      )
    ).toEqual(['###', '###', '##.']);
  });

  it('reads sliced RGBA at its byte offset in the wrapper and vendored kernel', () => {
    const storage = new Uint8ClampedArray([
      9, 9, 9, 255, 10, 10, 10, 255, 10, 10, 10, 255, 20, 20, 20, 255,
    ]);
    const rgba = storage.subarray(4);
    const before = storage.slice();
    expect([...findRegion(options([10, 10, 20], { rgba }))]).toEqual([255, 255, 0]);
    expect([...floodFillBits(rgba, undefined, 3, 1, 0, 0, 0, 0, true).data]).toEqual([255, 255, 0]);
    expect(storage).toEqual(before);
  });

  it('rejects invalid dimensions, shape, seed and options before changing data', () => {
    const base = options([10, 20]);
    const before = base.rgba.slice();
    const invalid: Partial<RegionOptions>[] = [
      { width: 0 },
      { width: 32769 },
      { width: 10001, height: 10000 },
      { rgba: new Uint8ClampedArray(7) },
      { selection: new Uint8Array(1) },
      { selection: new Uint8Array([255, 1]) },
      { seed: { x: -1, y: 0 } },
      { seed: { x: 2, y: 0 } },
      { seed: { x: 0.5, y: 0 } },
      { seed: { x: 0, y: Infinity } },
      { tolerance: -1 },
      { tolerance: 256 },
      { tolerance: 0.5 },
      { grow: -1 },
      { grow: 0.5 },
      { grow: Infinity },
    ];
    for (const override of invalid) expect(() => findRegion({ ...base, ...override })).toThrow();
    expect(base.rgba).toEqual(before);
  });
});
