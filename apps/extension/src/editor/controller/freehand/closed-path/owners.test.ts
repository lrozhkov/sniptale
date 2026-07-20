import { expect, it } from 'vitest';
import { alignClosedPathDirection, alignClosedPathStart } from './alignment';
import { resolveCandidateShapeFrame } from './frame';
import { buildRectanglePath, buildTrianglePath } from './polygon';
import { buildRoundedPath } from './rounded';

const points = [
  { x: 0, y: 0 },
  { x: 42, y: 0 },
  { x: 42, y: 30 },
  { x: 0, y: 30 },
  { x: 0, y: 0 },
];

it('owns closed path direction and start alignment', () => {
  const outline = [
    { x: 42, y: 0 },
    { x: 42, y: 30 },
    { x: 0, y: 30 },
    { x: 0, y: 0 },
    { x: 42, y: 0 },
  ];

  expect(alignClosedPathStart(outline, { x: 0, y: 0 })[0]).toEqual({ x: 0, y: 0 });
  expect(alignClosedPathDirection(outline, points)).toHaveLength(outline.length);
});

it('owns closed candidate frame fallback and polygon builders', () => {
  expect(resolveCandidateShapeFrame({ confidence: 1, kind: 'rectangle' }, points, points)).toEqual(
    expect.objectContaining({ height: expect.any(Number), width: expect.any(Number) })
  );
  expect(
    buildRectanglePath({ confidence: 1, isSquare: true, kind: 'rectangle' }, points)
  ).toHaveLength(5);
  expect(buildTrianglePath({ confidence: 1, kind: 'triangle' }, points)).toHaveLength(4);
});

it('owns rounded candidate paths for circle and ellipse kinds', () => {
  expect(
    buildRoundedPath({ center: { x: 21, y: 15 }, confidence: 1, kind: 'circle', width: 20 }, points)
      .length
  ).toBeGreaterThan(4);
  expect(
    buildRoundedPath({ confidence: 1, height: 20, kind: 'ellipse', width: 30 }, points).length
  ).toBeGreaterThan(4);
});
