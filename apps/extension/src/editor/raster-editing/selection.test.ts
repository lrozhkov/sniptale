import { describe, expect, it } from 'vitest';
import { assertRasterSize, type RasterSourceGeometry } from './contracts';
import {
  clearSelection,
  combineSelection,
  invertSelection,
  lassoMask,
  rectangleMask,
  selectionBounds,
  workingSelectionMask,
  gestureSelectionMask,
  wrapRasterSourcePoint,
  isRasterSourcePointVisible,
} from './selection';

const size = { width: 4, height: 4 };
const point = (x: number, y: number) => ({ x, y });
const square = (x: number, y: number, width: number, height = width) => [
  point(x, y),
  point(x + width, y),
  point(x + width, y + height),
  point(x, y + height),
];
const rows = (mask: Uint8Array, width: number): string[] =>
  Array.from({ length: mask.length / width }, (_, y) =>
    Array.from(mask.slice(y * width, (y + 1) * width), (value) => (value === 255 ? '#' : '.')).join(
      ''
    )
  );

describe('source-pixel geometry', () => {
  it('clips reversed rectangles and uses half-open pixel-center coverage', () => {
    expect(rows(rectangleMask(size, point(3.5, 3), point(-2, 0.5)), 4)).toEqual([
      '###.',
      '###.',
      '###.',
      '....',
    ]);
    expect(rows(rectangleMask(size, point(1, 1), point(1, 3)), 4)).toEqual([
      '....',
      '....',
      '....',
      '....',
    ]);
    for (const [start, end] of [
      [point(-8, -8), point(-1, -1)],
      [point(8, 8), point(9, 9)],
    ] as const) {
      expect(rows(rectangleMask(size, start, end), 4)).toEqual(['....', '....', '....', '....']);
    }
  });

  it('fills even-odd holes and nested islands without changing contours', () => {
    const contours = [square(0, 0, 5), square(1, 1, 3), square(2, 2, 1)];
    const snapshot = structuredClone(contours);
    expect(rows(lassoMask({ width: 5, height: 5 }, contours), 5)).toEqual([
      '#####',
      '#...#',
      '#.#.#',
      '#...#',
      '#####',
    ]);
    expect(contours).toEqual(snapshot);
  });

  it('fills self-crossings and disconnected contours by even-odd coverage', () => {
    expect(
      rows(lassoMask(size, [[point(0, 0), point(4, 4), point(0, 4), point(4, 0)]]), 4)
    ).toEqual(['###.', '.#..', '.#..', '###.']);
    expect(rows(lassoMask(size, [square(-1, -1, 2), square(3, 3, 2)]), 4)).toEqual([
      '#...',
      '....',
      '....',
      '...#',
    ]);
  });

  it('handles shared edges, duplicate contours, corner contacts and closing vertices', () => {
    expect(rows(lassoMask(size, [square(0, 0, 2), square(2, 0, 2)]), 4)).toEqual([
      '####',
      '####',
      '....',
      '....',
    ]);
    expect(rows(lassoMask(size, [square(0, 0, 2), square(2, 2, 2)]), 4)).toEqual([
      '##..',
      '##..',
      '..##',
      '..##',
    ]);
    expect(rows(lassoMask(size, [square(0, 0, 4), square(0, 0, 4)]), 4)).toEqual([
      '....',
      '....',
      '....',
      '....',
    ]);
    expect(rows(lassoMask(size, [[...square(0.5, 0.5, 2), point(0.5, 0.5)]]), 4)).toEqual([
      '##..',
      '##..',
      '....',
      '....',
    ]);
    expect(rows(lassoMask(size, []), 4)).toEqual(['....', '....', '....', '....']);
  });

  it('rejects invalid geometry and uses the established document dimension limits', () => {
    expect(() => rectangleMask(size, point(NaN, 0), point(1, 1))).toThrow(RangeError);
    expect(() => lassoMask(size, [[point(0, 0), point(1, 1)]])).toThrow(RangeError);
    expect(() => lassoMask(size, [[point(0, 0), point(Infinity, 1), point(1, 0)]])).toThrow(
      RangeError
    );
    for (const invalid of [
      { width: 0, height: 4 },
      { width: 1.5, height: 2 },
      { width: 32769, height: 1 },
      { width: 10001, height: 10000 },
      { width: NaN, height: 1 },
    ]) {
      expect(() => rectangleMask(invalid, point(0, 0), point(1, 1))).toThrow(RangeError);
    }
    expect(assertRasterSize({ width: 32768, height: 1 })).toBe(32768);
    expect(assertRasterSize({ width: 10000, height: 10000 })).toBe(100_000_000);
  });
});

describe('immutable selection algebra', () => {
  const line = { width: 4, height: 1 };
  it('combines, inverts and clears masks with explicit null and empty semantics', () => {
    const current = new Uint8Array([255, 0, 255, 0]);
    const incoming = new Uint8Array([0, 255, 255, 0]);
    const beforeCurrent = current.slice();
    const beforeIncoming = incoming.slice();
    const replaced = combineSelection(line, current, incoming, 'new');
    expect([...replaced]).toEqual([0, 255, 255, 0]);
    expect(replaced).not.toBe(incoming);
    expect([...combineSelection(line, current, incoming, 'add')]).toEqual([255, 255, 255, 0]);
    expect([...combineSelection(line, current, incoming, 'subtract')]).toEqual([255, 0, 0, 0]);
    expect([...combineSelection(line, null, incoming, 'add')]).toEqual([0, 255, 255, 0]);
    expect([...combineSelection(line, null, incoming, 'subtract')]).toEqual([255, 0, 0, 255]);
    expect([...invertSelection(line, current)]).toEqual([0, 255, 0, 255]);
    expect([...invertSelection(line, null)]).toEqual([0, 0, 0, 0]);
    expect([...invertSelection(line, new Uint8Array(4))]).toEqual([255, 255, 255, 255]);
    expect([...combineSelection(line, new Uint8Array(4), incoming, 'subtract')]).toEqual([
      0, 0, 0, 0,
    ]);
    expect(clearSelection()).toBeNull();
    expect(current).toEqual(beforeCurrent);
    expect(incoming).toEqual(beforeIncoming);
  });

  it('validates binary masks before computing and returns exact source bounds', () => {
    const invalid = new Uint8Array([0, 1, 0, 0]);
    expect(() => combineSelection(line, null, invalid, 'new')).toThrow(RangeError);
    expect([...invalid]).toEqual([0, 1, 0, 0]);
    expect(() => invertSelection(line, new Uint8Array(3))).toThrow(TypeError);
    expect(selectionBounds(size, null)).toEqual({ x: 0, y: 0, width: 4, height: 4 });
    expect(selectionBounds(size, new Uint8Array(16))).toBeNull();
    expect(selectionBounds(size, rectangleMask(size, point(1, 2), point(3, 4)))).toEqual({
      x: 1,
      y: 2,
      width: 2,
      height: 2,
    });
  });
});

function projection(): RasterSourceGeometry {
  return {
    width: 4,
    height: 4,
    crop: { x: 0, y: 0, width: 4, height: 4 },
    sourceToScene: [1, 0, 0, 1, 0, 0],
    periodic: false,
  };
}

it('restricts nonperiodic working masks to source crop, native bounds, scene bounds and explicit selection', () => {
  const geometry: RasterSourceGeometry = {
    ...projection(),
    crop: { x: 1, y: 0, width: 3, height: 4 },
    sourceClip: { x: 0, y: 0, width: 3, height: 4 },
    sceneClip: { x: 3, y: 0, width: 2, height: 4 },
    sourceToScene: [2, 0, 0, 1, 0, 0],
  };
  const selected = rectangleMask(size, point(0, 1), point(4, 3));
  const before = selected.slice();
  expect(rows(workingSelectionMask(geometry, selected), 4)).toEqual([
    '....',
    '.#..',
    '.#..',
    '....',
  ]);
  expect(selected).toEqual(before);
});

it('edits the shared source crop across periodic repetitions', () => {
  const geometry: RasterSourceGeometry = {
    ...projection(),
    periodic: true,
    crop: { x: 1, y: 1, width: 2, height: 2 },
    sourceClip: { x: 5, y: 1, width: 2, height: 2 },
    sceneClip: { x: 5, y: 1, width: 2, height: 2 },
  };
  expect(rows(workingSelectionMask(geometry, null), 4)).toEqual(['....', '.##.', '.##.', '....']);
  expect(wrapRasterSourcePoint(geometry.crop, point(1.5, 1.5))).toEqual(
    wrapRasterSourcePoint(geometry.crop, point(5.5, 1.5))
  );
  expect(isRasterSourcePointVisible(geometry, point(1.5, 1.5))).toBe(false);
  expect(isRasterSourcePointVisible(geometry, point(5.5, 1.5))).toBe(true);
});

it.each(['rectangle', 'lasso'] as const)(
  'clips an unwrapped periodic %s before folding the cropped source period',
  (kind) => {
    const geometry: RasterSourceGeometry = {
      ...projection(),
      periodic: true,
      crop: { x: 1, y: 1, width: 2, height: 2 },
      sourceClip: { x: 2, y: 1, width: 2, height: 2 },
      sceneClip: { x: 3, y: 1, width: 1, height: 2 },
    };
    const points = kind === 'rectangle' ? [point(2, 1), point(4, 3)] : square(2, 1, 2);
    const before = structuredClone(points);
    expect(rows(gestureSelectionMask(geometry, points, kind), 4)).toEqual([
      '....',
      '.#..',
      '.#..',
      '....',
    ]);
    expect(points).toEqual(before);
  }
);

it.each(['rectangle', 'lasso'] as const)(
  'clips nonperiodic %s coverage at source pixel centers',
  (kind) => {
    const geometry: RasterSourceGeometry = {
      ...projection(),
      crop: { x: 1, y: 1, width: 2, height: 2 },
      sourceClip: { x: 1, y: 0, width: 1, height: 4 },
    };
    const points = kind === 'rectangle' ? [point(0, 0), point(4, 4)] : square(0, 0, 4);
    expect(rows(gestureSelectionMask(geometry, points, kind), 4)).toEqual([
      '....',
      '.#..',
      '.#..',
      '....',
    ]);
  }
);

it('preserves two-point lasso rectangle fallback and clipped empty gesture results', () => {
  const geometry = projection();
  expect(gestureSelectionMask(geometry, [point(1, 1), point(3, 3)], 'lasso')).toEqual(
    rectangleMask(size, point(1, 1), point(3, 3))
  );
  expect(
    gestureSelectionMask(
      { ...geometry, periodic: true, sourceClip: { x: 20, y: 0, width: 4, height: 4 } },
      [point(0, 0), point(4, 4)],
      'rectangle'
    )
  ).toEqual(new Uint8Array(16));
});
