import { expect, it } from 'vitest';
import { clusterHistoryMarkers, clusterHistoryIntervals } from './history-clusters';

it('keeps every overlapping event reachable and separates non-overlapping pixel targets', () => {
  const markers = [
    { id: 'later', left: 120 },
    { id: 'a', left: 10 },
    { id: 'hidden', left: null },
    { id: 'b', left: 30 },
    { id: 'same', left: 30 },
    { id: 'c', left: 50 },
  ];
  expect(clusterHistoryMarkers(markers)).toEqual([
    { left: 10, ids: ['a', 'b', 'same', 'c'] },
    { left: 120, ids: ['later'] },
  ]);
  expect(markers[0]?.id).toBe('later');
  expect(
    clusterHistoryMarkers(
      markers.map((item) => ({ ...item, left: item.left === null ? null : item.left * 4 }))
    )
  ).toEqual([
    { left: 40, ids: ['a'] },
    { left: 120, ids: ['b', 'same'] },
    { left: 200, ids: ['c'] },
    { left: 480, ids: ['later'] },
  ]);
});

it('groups visible members without retaining an overscan anchor', () => {
  const markers = Array.from({ length: 11 }, (_, index) => ({
    id: `event-${index}`,
    left: -100 + index * 20,
  }));
  expect(clusterHistoryMarkers(markers, 200)).toEqual([
    { left: 20, ids: ['event-5', 'event-6', 'event-7', 'event-8', 'event-9', 'event-10'] },
  ]);
  expect(markers[0]).toEqual({ id: 'event-0', left: -100 });
});

it('clusters after edge adjustment so independent targets cannot overlap at a viewport boundary', () => {
  expect(
    clusterHistoryMarkers(
      [
        { id: 'zero', left: 0 },
        { id: 'near-zero', left: 30 },
        { id: 'middle', left: 100 },
        { id: 'near-end', left: 170 },
        { id: 'end', left: 200 },
      ],
      200
    )
  ).toEqual([
    { left: 20, ids: ['zero', 'near-zero'] },
    { left: 100, ids: ['middle'] },
    { left: 170, ids: ['near-end', 'end'] },
  ]);
});

it('omits offscreen-only targets instead of gathering them into edge clusters', () => {
  expect(
    clusterHistoryMarkers(
      [
        { id: 'before', left: -1 },
        { id: 'after', left: 201 },
        { id: 'unprojected', left: null },
      ],
      200
    )
  ).toEqual([]);
});

it('groups identical and nested typing hit intervals without losing the outer right edge', () => {
  const intervals = [
    { id: 'outer', left: 100, width: 300 },
    { id: 'same', left: 100, width: 300 },
    { id: 'nested', left: 150, width: 20 },
    { id: 'later-inside', left: 350, width: 20 },
    { id: 'separate', left: 450, width: 30 },
  ];
  const original = structuredClone(intervals);
  expect(clusterHistoryIntervals(intervals)).toEqual([
    { left: 100, width: 300, ids: ['outer', 'same', 'nested', 'later-inside'] },
    { left: 450, width: 30, ids: ['separate'] },
  ]);
  expect(intervals).toEqual(original);
});

it('clusters short typing spans by rendered minimum width rather than raw duration', () => {
  expect(
    clusterHistoryIntervals([
      { id: 'short-a', left: 10, width: 1 },
      { id: 'short-b', left: 20, width: 1 },
      { id: 'touching', left: 36, width: 1 },
    ])
  ).toEqual([
    { left: 10, width: 26, ids: ['short-a', 'short-b'] },
    { left: 36, width: 16, ids: ['touching'] },
  ]);
});

it('retains intersecting typing intervals but omits entirely offscreen and unprojected ones', () => {
  expect(
    clusterHistoryIntervals(
      [
        { id: 'offscreen', left: -50, width: 20 },
        { id: 'crossing', left: -20, width: 100 },
        { id: 'nested', left: 30, width: 10 },
        { id: 'after', left: 200, width: 30 },
        { id: 'unprojected', left: null, width: 30 },
      ],
      200
    )
  ).toEqual([{ left: 0, width: 80, ids: ['crossing', 'nested'] }]);
});
