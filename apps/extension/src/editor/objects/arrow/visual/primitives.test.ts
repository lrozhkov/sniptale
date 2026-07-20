import { expect, it } from 'vitest';

import { buildDynamicShaftOutlinePath, buildShaftOutlinePath, trimPolyline } from './primitives';

function parsePathPoints(path: string): Array<{ x: number; y: number }> {
  const tokens = path.split(' ');
  const points: Array<{ x: number; y: number }> = [];

  for (let index = 0; index < tokens.length - 2; index += 1) {
    if (tokens[index] !== 'M' && tokens[index] !== 'L') {
      continue;
    }
    points.push({ x: Number(tokens[index + 1]), y: Number(tokens[index + 2]) });
  }
  return points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function expectPathToContainPoint(
  points: Array<{ x: number; y: number }>,
  expected: { x: number; y: number }
): void {
  expect(
    points.some((point) => {
      return Math.abs(point.x - expected.x) < 0.001 && Math.abs(point.y - expected.y) < 0.001;
    })
  ).toBe(true);
}

function registerIdentityTrimTest() {
  it('returns the original polyline when no trim is requested', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];

    expect(trimPolyline(points, 0, 0)).toEqual(points);
  });
}

function registerStartOverflowTrimTest() {
  it('collapses to an edge anchor when a trim exceeds the path length', () => {
    expect(
      trimPolyline(
        [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
        ],
        12,
        0
      )
    ).toEqual([
      { x: 5, y: 0 },
      { x: 5, y: 0 },
    ]);
    expect(
      trimPolyline(
        [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
        ],
        0,
        12
      )
    ).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
  });
}

function registerZeroLengthEndTrimTest() {
  it('skips zero-length and sparse segments while trimming path edges', () => {
    expect(
      trimPolyline(
        [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        0,
        4
      )
    ).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 6, y: 0 },
    ]);
    expect(
      trimPolyline(
        [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
          { x: 8, y: 0 },
        ],
        2,
        0
      )
    ).toEqual([
      { x: 2, y: 0 },
      { x: 8, y: 0 },
    ]);
  });
}

it('builds a closed shaft polygon for a non-degenerate polyline', () => {
  const path = buildShaftOutlinePath(
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 18, y: 6 },
    ],
    4
  );

  expect(path).toContain('Z');
  expect(path).not.toContain('NaN');
  expect(buildShaftOutlinePath([{ x: 2, y: 3 }], 4)).toContain('Z');
  expect(
    buildShaftOutlinePath(
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
      4
    )
  ).not.toContain('NaN');
});

it('builds mitered joins for orthogonal arrow shafts', () => {
  const path = buildShaftOutlinePath(
    [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 40 },
      { x: 100, y: 40 },
    ],
    10
  );

  expect(path).toContain('L 45 5');
  expect(path).toContain('L 45 45');
  expect(path).toContain('L 55 35');
  expect(path).not.toContain('NaN');
});

it('preserves the next segment width after sharp post-elbow bends', () => {
  const path = buildShaftOutlinePath(
    [
      { x: 0, y: -140 },
      { x: 0, y: 0 },
      { x: 160, y: 0 },
      { x: 80, y: -120 },
    ],
    18
  );
  const points = parsePathPoints(path);

  expectPathToContainPoint(points, { x: 160, y: 9 });
  expectPathToContainPoint(points, { x: 167.4884526490406, y: -4.9923017660270625 });
  expectPathToContainPoint(points, { x: 152.5115473509594, y: 4.9923017660270625 });
  expectPathToContainPoint(points, { x: 160, y: -9 });
});

function registerDynamicShaftOutlineTest() {
  it('builds dynamic shaft polygons without changing the closed-path contract', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 24, y: 0 },
    ];
    const dynamicPath = buildDynamicShaftOutlinePath(points, 8);

    expect(dynamicPath).toContain('Z');
    expect(dynamicPath).not.toBe(buildShaftOutlinePath(points, 8));
    expect(dynamicPath).toContain('1.52');
    expect(dynamicPath).toContain('5.12');
    expect(buildDynamicShaftOutlinePath([{ x: 2, y: 3 }], 8)).toContain('Z');
  });

  it('falls back from long miters on acute dynamic-width bends', () => {
    const vertex = { x: 50, y: 0 };
    const path = buildDynamicShaftOutlinePath([{ x: 0, y: 86.6 }, vertex, { x: 100, y: 86.6 }], 18);
    const vertexJoinPoints = parsePathPoints(path).filter((point) => {
      return point.x >= 40 && point.x <= 60 && point.y >= -20 && point.y <= 20;
    });
    const farthestJoinDistance = Math.max(
      ...vertexJoinPoints.map((point) => Math.hypot(point.x - vertex.x, point.y - vertex.y))
    );

    expect(farthestJoinDistance).toBeLessThan(12);
  });
}

registerIdentityTrimTest();
registerStartOverflowTrimTest();
registerZeroLengthEndTrimTest();
registerDynamicShaftOutlineTest();
