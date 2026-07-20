import { expect, it } from 'vitest';

import { getOffsetJoinPoints } from './shaft-outline-joins';

it('resolves endpoint, missing-point, and mitered shaft outline joins', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
  ];

  expect(getOffsetJoinPoints(points, 10, [4, 4, 4], 1)).toEqual([{ x: 0, y: 0 }]);
  expect(getOffsetJoinPoints(points, 0, [4, 4, 4], 1)).toEqual([{ x: 0, y: 4 }]);
  expect(getOffsetJoinPoints(points, 2, [4, 4, 4], -1)).toEqual([{ x: 24, y: 20 }]);
  expect(getOffsetJoinPoints(points, 1, [4, 4, 4], 1)).toEqual([{ x: 16, y: 4 }]);
});

it('falls back to split joins when the miter is too long', () => {
  expect(
    getOffsetJoinPoints(
      [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
      ],
      1,
      [20, 1, 20],
      1
    )
  ).toHaveLength(2);
});

it('falls back when middle join data cannot produce a miter intersection', () => {
  expect(
    getOffsetJoinPoints(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
      ],
      1,
      [4, 4, 4],
      1
    )
  ).toHaveLength(2);
});

it('uses outline normal fallback for sparse middle join neighbors', () => {
  const points = [] as Array<{ x: number; y: number }>;
  points[1] = { x: 10, y: 0 };
  points[2] = { x: 20, y: 0 };

  expect(getOffsetJoinPoints(points, 1, [4, 4, 4], 1)).toEqual([{ x: 10, y: 4 }]);
});
