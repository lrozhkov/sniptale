import { expect, it } from 'vitest';
import { createReviewFragment } from './fragment';
import { buildReviewTimeMap } from './timeline';
import type { ReviewEdit } from './types';

const input = {
  selection: { kind: 'range' as const, start: 1.8, end: 8.1 },
  duration: 10,
  boundaries: [0, 2, 4, 6, 8, 10],
  edits: [],
};
it('snaps the fragment and clips internal edits without changing the source document', () => {
  const edits: ReviewEdit[] = [
    {
      id: 'fragment-boundary',
      kind: 'speed',
      start: 0,
      end: 4,
      requestedStart: 0,
      requestedEnd: 4,
      rate: 0.125,
      audio: 'speed',
    },
    { id: 'cut', kind: 'cut', start: 6, end: 10, requestedStart: 6, requestedEnd: 10 },
  ];
  const before = structuredClone(edits);
  const fragment = createReviewFragment({ ...input, edits })!;
  expect(fragment).toMatchObject({ start: 2, end: 8 });
  expect(fragment.edits.map((edit) => [edit.kind, edit.start, edit.end])).toEqual([
    ['cut', 0, 2],
    ['speed', 2, 4],
    ['cut', 6, 8],
    ['cut', 8, 10],
  ]);
  expect(new Set(fragment.edits.map((edit) => edit.id)).size).toBe(4);
  expect(buildReviewTimeMap(10, fragment.edits).at(-1)?.resultEnd).toBe(18);
  expect(edits).toEqual(before);
});
it('rejects points, empty snapped ranges, invalid bounds and entirely removed fragments', () => {
  for (const selection of [
    { kind: 'point' as const, time: 3 },
    { kind: 'range' as const, start: 2.1, end: 2.2 },
    { kind: 'range' as const, start: -1, end: 8 },
    { kind: 'range' as const, start: 2, end: Infinity },
    { kind: 'range' as const, start: 2, end: 11 },
  ])
    expect(createReviewFragment({ ...input, selection })).toBeNull();
  expect(
    createReviewFragment({
      ...input,
      edits: [{ id: 'cut', kind: 'cut', start: 2, end: 8, requestedStart: 2, requestedEnd: 8 }],
    })
  ).toBeNull();
  expect(createReviewFragment({ ...input, boundaries: [] })).toBeNull();
});

it('preserves advanced fragment endpoints between keyframes', () => {
  const fragment = createReviewFragment({ ...input, snapToKeyframes: false });
  expect(fragment).toMatchObject({ start: 1.8, end: 8.1 });
  expect(buildReviewTimeMap(10, fragment!.edits).at(-1)?.resultEnd).toBeCloseTo(6.3);
});
