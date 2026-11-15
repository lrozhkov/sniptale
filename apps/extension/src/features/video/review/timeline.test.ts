import { expect, it } from 'vitest';
import {
  buildReviewTimeMap,
  createReviewDisplayMap,
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

it('lets a cut temporarily suppress the intersected span of a speed edit', () => {
  const speed = {
    id: 'speed',
    kind: 'speed' as const,
    start: 1,
    end: 7,
    requestedStart: 1,
    requestedEnd: 7,
    rate: 2 as const,
    audio: 'mute' as const,
  };
  const cut = {
    id: 'cut',
    kind: 'cut' as const,
    start: 3,
    end: 5,
    requestedStart: 3,
    requestedEnd: 5,
  };
  expect(
    buildReviewTimeMap(10, [speed, cut]).map(({ sourceStart, sourceEnd, kind }) => [
      sourceStart,
      sourceEnd,
      kind,
    ])
  ).toEqual([
    [0, 1, 'keep'],
    [1, 3, 'speed'],
    [3, 5, 'cut'],
    [5, 7, 'speed'],
    [7, 10, 'keep'],
  ]);
  expect(buildReviewTimeMap(10, [speed]).at(-1)?.resultEnd).toBe(7);
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

it('inserts source-zero-width held time without changing source observations or later speed', () => {
  const freeze = {
    id: 'freeze-a',
    kind: 'freeze' as const,
    start: 4,
    end: 4,
    requestedStart: 4,
    requestedEnd: 4,
    duration: 2,
    frameTime: 3.97,
    frameDuration: 0.04,
  };
  const edits = [
    freeze,
    {
      id: 'speed',
      kind: 'speed' as const,
      start: 6,
      end: 10,
      requestedStart: 6,
      requestedEnd: 10,
      rate: 2 as const,
      audio: 'speed' as const,
    },
  ];
  const original = structuredClone(edits);
  const map = createReviewTimeMap(12, edits);
  expect(map.getDuration()).toBe(12);
  expect(map.getSegments().find((segment) => segment.kind === 'freeze')).toMatchObject({
    sourceStart: 4,
    sourceEnd: 4,
    resultStart: 4,
    resultEnd: 6,
    rate: 0,
    frameTime: 3.97,
    freezeId: 'freeze-a',
  });
  expect(map.timelineToSource(5)).toBe(3.97);
  expect(map.sourceToTimeline(4)).toBe(6);
  expect(map.sourceToTimeline(8)).toBe(9);
  expect(edits).toEqual(original);
  expect(
    createReviewTimeMap(
      12,
      edits.filter((edit) => edit.kind !== 'freeze')
    ).getDuration()
  ).toBe(10);
});

it('holds the actual final frame and temporarily suppresses an insertion under a cut', () => {
  const freeze = {
    id: 'freeze-end',
    kind: 'freeze' as const,
    start: 12,
    end: 12,
    requestedStart: 12,
    requestedEnd: 12,
    duration: 2,
    frameTime: 11.95,
    frameDuration: 0.05,
  };
  const map = createReviewTimeMap(12, [freeze]);
  expect(map.getDuration()).toBe(14);
  expect(map.timelineToSource(13.9)).toBe(11.95);
  expect(map.timelineToSource(14)).toBe(12);
  const inside = {
    ...freeze,
    id: 'inside',
    start: 4,
    end: 4,
    requestedStart: 4,
    requestedEnd: 4,
    frameTime: 3.99,
    frameDuration: 0.02,
  };
  const cut = {
    id: 'cut',
    kind: 'cut' as const,
    start: 3,
    end: 5,
    requestedStart: 3,
    requestedEnd: 5,
  };
  expect(createReviewTimeMap(12, [inside, cut]).getDuration()).toBe(10);
  expect(createReviewTimeMap(12, [inside]).getDuration()).toBe(14);
});

it('holds a leading nonzero PTS without inventing a source frame at zero', () => {
  const hold = {
    id: 'first',
    kind: 'freeze' as const,
    start: 0,
    end: 0,
    requestedStart: 0,
    requestedEnd: 0,
    duration: 2,
    frameTime: 0.033,
    frameDuration: 0.04,
  };
  const map = createReviewTimeMap(12, [hold]);
  expect(map.timelineToSource(0)).toBe(0.033);
  expect(map.timelineToSource(1.99)).toBe(0.033);
  expect(map.sourceToTimeline(0)).toBe(2);
  for (const change of [{ frameDuration: 1e308 }, { duration: 0 }, { frameTime: 12 }])
    expect(() => createReviewTimeMap(12, [{ ...hold, ...change }])).toThrow('freeze interval');
});

it('gives inserted time physical width while retaining source coordinates and cut/speed widths', () => {
  const edits = [
    {
      id: 'hold',
      kind: 'freeze' as const,
      start: 4,
      end: 4,
      requestedStart: 4,
      requestedEnd: 4,
      duration: 2,
      frameTime: 3.98,
      frameDuration: 0.04,
    },
    {
      id: 'speed',
      kind: 'speed' as const,
      start: 6,
      end: 10,
      requestedStart: 6,
      requestedEnd: 10,
      rate: 2 as const,
      audio: 'speed' as const,
    },
    { id: 'cut', kind: 'cut' as const, start: 1, end: 2, requestedStart: 1, requestedEnd: 2 },
  ];
  const before = structuredClone(edits);
  const map = createReviewDisplayMap(12, edits);
  expect(map.duration).toBe(14);
  expect(map.sourceToDisplay(4)).toBe(6);
  expect(map.sourceToDisplay(4, 'end')).toBe(4);
  expect(map.sourceToDisplay(8)).toBe(10);
  expect(map.displayToSource(5)).toBe(4);
  expect(map.displayToResult(5)).toBe(4);
  expect(map.resultToDisplay(4)).toBe(5);
  expect(map.resultToDisplay(8)).toBe(10);
  for (const display of [0, 0.5, 3, 4, 4.5, 5, 6, 8, 10, 13.9, 14])
    expect(map.resultToDisplay(map.displayToResult(display))).toBeCloseTo(display);
  expect(
    createReviewDisplayMap(
      12,
      edits.filter((edit) => edit.kind !== 'freeze')
    ).sourceToDisplay(8)
  ).toBe(8);
  expect(edits).toEqual(before);
});
