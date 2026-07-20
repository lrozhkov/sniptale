import { expect, it } from 'vitest';
import { readLinePoints } from './points';

it('reads serialized line points before object point metadata and clones results', () => {
  const line = {
    sniptaleLinePoints: [{ x: 9, y: 9 }],
    sniptaleLinePointsJson: '[{"x":1,"y":2}]',
  };

  const points = readLinePoints(line as never);
  expect(points).toEqual([
    { x: 1, y: 2 },
    { x: 1, y: 2 },
  ]);
  points[0]!.x = 5;
  expect(readLinePoints(line as never)).toEqual([
    { x: 1, y: 2 },
    { x: 1, y: 2 },
  ]);
});

it('falls back to stored line point metadata when serialized points are missing', () => {
  const line = {
    sniptaleLinePoints: [
      { x: 3, y: 4 },
      { x: 5, y: 6 },
    ],
  };

  const points = readLinePoints(line as never);
  expect(points).toEqual([
    { x: 3, y: 4 },
    { x: 5, y: 6 },
  ]);
  points[0]!.x = 10;
  expect(line.sniptaleLinePoints[0]).toEqual({ x: 3, y: 4 });
});

it('returns an empty point list when line metadata is absent', () => {
  expect(readLinePoints({} as never)).toEqual([]);
});
