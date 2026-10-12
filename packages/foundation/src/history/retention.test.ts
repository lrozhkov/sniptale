import { expect, it } from 'vitest';
import { selectHistoryRetentionWindow } from './retention';

const costs = (count: number, bytes = 1) =>
  Array.from({ length: count }, () => ({ actions: 1, bytes }));
const limits = { maxActions: 50, maxBytes: 8 * 1024 * 1024 };

it.each([
  { count: 49, cursor: 49, start: 0, end: 49, nextCursor: 49 },
  { count: 50, cursor: 50, start: 0, end: 50, nextCursor: 50 },
  { count: 51, cursor: 51, start: 1, end: 51, nextCursor: 50 },
  { count: 1190, cursor: 1190, start: 1140, end: 1190, nextCursor: 50 },
  { count: 1190, cursor: 0, start: 0, end: 50, nextCursor: 0 },
  { count: 1190, cursor: 600, start: 575, end: 625, nextCursor: 25 },
])(
  'selects the complete contiguous count window at $count/$cursor',
  ({ count, cursor, start, end, nextCursor }) => {
    expect(selectHistoryRetentionWindow(costs(count), cursor, limits)).toMatchObject({
      start,
      end,
      cursor: nextCursor,
    });
  }
);

it.each([
  { maxBytes: 99, start: 1, bytes: 60 },
  { maxBytes: 100, start: 0, bytes: 100 },
  { maxBytes: 101, start: 0, bytes: 100 },
])('uses exact encoded byte boundary $maxBytes', ({ maxBytes, start, bytes }) => {
  expect(
    selectHistoryRetentionWindow(
      [
        { actions: 1, bytes: 40 },
        { actions: 1, bytes: 60 },
      ],
      2,
      { maxActions: 50, maxBytes }
    )
  ).toEqual({ start, end: 2, cursor: 2 - start, actions: 2 - start, bytes });
});

it('prefers Undo over equally distant Redo when only one fits', () => {
  expect(selectHistoryRetentionWindow(costs(2, 8), 1, { maxActions: 50, maxBytes: 8 })).toEqual({
    start: 0,
    end: 1,
    cursor: 1,
    actions: 1,
    bytes: 8,
  });
});

it('retains whole compound groups and cannot skip an oversized adjacent group', () => {
  expect(
    selectHistoryRetentionWindow(
      [
        { actions: 1, bytes: 1 },
        { actions: 1, bytes: 100 },
        { actions: 2, bytes: 4 },
      ],
      2,
      { maxActions: 3, maxBytes: 5 }
    )
  ).toEqual({ start: 2, end: 3, cursor: 0, actions: 2, bytes: 4 });
});

it('returns an empty window at the current cursor for an oversized action', () => {
  expect(
    selectHistoryRetentionWindow([{ actions: 1, bytes: 100 }], 1, { maxActions: 50, maxBytes: 99 })
  ).toEqual({ start: 1, end: 1, cursor: 0, actions: 0, bytes: 0 });
});

it('keeps current ownership outside a disabled or empty history budget', () => {
  expect(selectHistoryRetentionWindow(costs(2), 1, { maxActions: 0, maxBytes: 0 })).toEqual({
    start: 1,
    end: 1,
    cursor: 0,
    actions: 0,
    bytes: 0,
  });
  expect(selectHistoryRetentionWindow([], 0, limits)).toEqual({
    start: 0,
    end: 0,
    cursor: 0,
    actions: 0,
    bytes: 0,
  });
});

it('does not mutate costs or limits and accounts for each group once', () => {
  const entries = Object.freeze([
    Object.freeze({ actions: 2, bytes: 7 }),
    Object.freeze({ actions: 1, bytes: 2 }),
  ]);
  expect(
    selectHistoryRetentionWindow(entries, 2, Object.freeze({ maxActions: 3, maxBytes: 9 }))
  ).toEqual({ start: 0, end: 2, cursor: 2, actions: 3, bytes: 9 });
});

it.each([-1, 3, 0.5, NaN])('rejects invalid cursor %s', (cursor) => {
  expect(() => selectHistoryRetentionWindow(costs(2), cursor, limits)).toThrow(RangeError);
});

it.each([
  { actions: 0, bytes: 1 },
  { actions: 1, bytes: -1 },
  { actions: 1, bytes: Infinity },
])('rejects invalid admitted cost %j', (cost) => {
  expect(() => selectHistoryRetentionWindow([cost], 1, limits)).toThrow(RangeError);
});
