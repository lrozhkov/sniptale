import { expect, it } from 'vitest';
import { buildReviewTimeMap, mapReviewAnchor, sourceToReviewResult } from './timeline';

it('maps adjacent cuts and acceleration without compressing the source axis', () => {
  const map = buildReviewTimeMap(12, [
    { id: 'c', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
    {
      id: 's',
      kind: 'speed',
      start: 4,
      end: 8,
      requestedStart: 4,
      requestedEnd: 8,
      rate: 2,
      audio: 'speed',
    },
  ]);
  expect(map.at(-1)?.sourceEnd).toBe(12);
  expect(map.at(-1)?.resultEnd).toBe(8);
  expect(sourceToReviewResult(3, map)).toBeNull();
  expect(sourceToReviewResult(4, map)).toBe(2);
  expect(sourceToReviewResult(6, map)).toBe(3);
  expect(sourceToReviewResult(12, map)).toBe(8);
  expect(mapReviewAnchor({ kind: 'range', start: 1, end: 6 }, map)).toEqual({
    excludedFromResult: false,
    partiallyExcluded: true,
    ranges: [
      { start: 1, end: 2 },
      { start: 2, end: 3 },
    ],
  });
  expect(mapReviewAnchor({ kind: 'point', time: 3 }, map).excludedFromResult).toBe(true);
});

it('rejects overlapping/outside intervals instead of manufacturing a result map', () => {
  const cut = {
    id: 'c',
    kind: 'cut' as const,
    start: 2,
    end: 4,
    requestedStart: 2,
    requestedEnd: 4,
  };
  expect(() => buildReviewTimeMap(3, [cut])).toThrow();
  expect(() => buildReviewTimeMap(10, [cut, { ...cut, id: 'd', start: 3 }])).toThrow();
});
