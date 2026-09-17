import { expect, it } from 'vitest';
import {
  buildReviewTimeMap,
  createReviewTimeMap,
  mapReviewAnchor,
  sourceToReviewResult,
} from './timeline';

const EPSILON = 1e-9;
const near = (value: number, expected: number) => Math.abs(value - expected) < EPSILON;

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

it('exposes one conversion authority for timeline consumers', () => {
  const timeMap = createReviewTimeMap(12, [
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
  expect(timeMap.getDuration()).toBe(8);
  expect(timeMap.sourceToTimeline(0)).toBe(0);
  expect(timeMap.sourceToTimeline(3)).toBeNull();
  expect(timeMap.sourceToTimeline(6)).toBe(3);
  expect(timeMap.sourceToTimeline(12)).toBe(8);
  expect(timeMap.timelineToSource(0)).toBe(0);
  expect(timeMap.timelineToSource(3)).toBe(6);
  expect(timeMap.timelineToSource(8)).toBe(12);
  expect(timeMap.timelineToSource(9)).toBeNull();
  expect(timeMap.timelineToSource(-0.5)).toBeNull();
  expect(timeMap.getSegments().map((part) => part.kind)).toEqual(['keep', 'cut', 'speed', 'keep']);
  for (const segment of timeMap.getSegments()) {
    if (segment.kind === 'cut') continue;
    for (const source of [segment.sourceStart, (segment.sourceStart + segment.sourceEnd) / 2]) {
      const round = timeMap.timelineToSource(timeMap.sourceToTimeline(source)!);
      if (round === null || !near(round, source)) throw new Error(`Round trip failed: ${source}`);
    }
  }
});

it('handles first/last frames, slow motion, and cut adjacent to speed', () => {
  const timeMap = createReviewTimeMap(10, [
    {
      id: 's',
      kind: 'speed',
      start: 0,
      end: 4,
      requestedStart: 0,
      requestedEnd: 4,
      rate: 0.5,
      audio: 'speed',
    },
    { id: 'c', kind: 'cut', start: 4, end: 5, requestedStart: 4, requestedEnd: 5 },
  ]);
  expect(timeMap.getDuration()).toBe(13);
  expect(timeMap.sourceToTimeline(0)).toBe(0);
  expect(timeMap.sourceToTimeline(10)).toBe(13);
  expect(timeMap.sourceToTimeline(2)).toBe(4);
  expect(timeMap.timelineToSource(4)).toBe(2);
  expect(timeMap.timelineToSource(4.5)).toBe(2.25);
  expect(timeMap.timelineToSource(8)).toBe(5);
  expect(timeMap.timelineToSource(13)).toBe(10);
  expect(timeMap.sourceToTimeline(5)).toBe(8);
  expect(timeMap.sourceToTimeline(4.5)).toBeNull();
  for (const segment of timeMap.getSegments()) {
    if (segment.kind === 'cut') continue;
    const round = timeMap.timelineToSource(timeMap.sourceToTimeline(segment.sourceEnd - 1e-12)!);
    if (round === null || !near(round, segment.sourceEnd - 1e-12))
      throw new Error(`Round trip failed near ${segment.sourceEnd}`);
  }
});

it('keeps float boundaries stable across speed-section boundaries', () => {
  const timeMap = createReviewTimeMap(3, [
    {
      id: 'a',
      kind: 'speed',
      start: 1,
      end: 2,
      requestedStart: 1,
      requestedEnd: 2,
      rate: 4,
      audio: 'speed',
    },
    {
      id: 'b',
      kind: 'speed',
      start: 2,
      end: 3,
      requestedStart: 2,
      requestedEnd: 3,
      rate: 0.125,
      audio: 'speed',
    },
  ]);
  expect(near(timeMap.getDuration(), 9 + 1 / 4)).toBe(true);
  const boundary = timeMap.sourceToTimeline(2);
  expect(near(boundary!, 5 / 4)).toBe(true);
  expect(near(timeMap.timelineToSource(boundary!)!, 2)).toBe(true);
  expect(near(timeMap.sourceToTimeline(2.5)!, 5 / 4 + 4)).toBe(true);
  expect(near(timeMap.timelineToSource(5 / 4 + 4)!, 2.5)).toBe(true);
  expect(near(timeMap.sourceToTimeline(1)!, 1)).toBe(true);
  expect(near(timeMap.timelineToSource(1)!, 1)).toBe(true);
});
