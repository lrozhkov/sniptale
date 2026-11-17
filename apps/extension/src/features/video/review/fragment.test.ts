import { expect, it } from 'vitest';
import { createReviewFragment } from './fragment';
import { planReviewCutTransitions } from './cuts';
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

it('retains transition intent but constrains endpoint authority to the selected fragment', () => {
  const edits: ReviewEdit[] = [
    {
      id: 'cut',
      kind: 'cut',
      start: 4,
      end: 6,
      requestedStart: 4,
      requestedEnd: 6,
      transition: { type: 'dissolve', before: 2, after: 2 },
    },
  ];
  const original = structuredClone(edits);
  const fragment = createReviewFragment({
    ...input,
    edits,
    snapToKeyframes: false,
    selection: { kind: 'range', start: 3.75, end: 6.5 },
  })!;
  expect(planReviewCutTransitions(10, fragment.edits)).toEqual([
    {
      id: 'cut',
      type: 'dissolve',
      seam: 0.25,
      before: 0.25,
      after: 0.5,
      left: { start: 3.75, end: 4 },
      right: { start: 6, end: 6.5 },
    },
  ]);
  expect(buildReviewTimeMap(10, fragment.edits).at(-1)?.resultEnd).toBe(0.75);
  const edge = createReviewFragment({
    ...input,
    edits,
    snapToKeyframes: false,
    selection: { kind: 'range', start: 5, end: 8 },
  })!;
  expect(planReviewCutTransitions(10, edge.edits)).toEqual([]);
  expect(edits).toEqual(original);
});

it('includes insertions at fragment start and the original EOF without importing later holds', () => {
  const hold = (id: string, start: number): ReviewEdit => ({
    id,
    kind: 'freeze',
    start,
    end: start,
    requestedStart: start,
    requestedEnd: start,
    duration: 2,
    frameTime: start === 10 ? 9.96 : start,
    frameDuration: 0.04,
  });
  const edits = [hold('first', 2), hold('next', 8), hold('eof', 10)];
  const before = structuredClone(edits);
  const fragment = createReviewFragment({ ...input, edits })!;
  expect(fragment.edits.filter((edit) => edit.kind === 'freeze').map((edit) => edit.id)).toEqual([
    'first',
  ]);
  expect(buildReviewTimeMap(10, fragment.edits).at(-1)!.resultEnd).toBe(8);
  expect(fragment.result).toEqual({ start: 2, end: 10 });
  const tail = createReviewFragment({
    ...input,
    edits,
    selection: { kind: 'range', start: 8, end: 10 },
  })!;
  expect(tail.edits.filter((edit) => edit.kind === 'freeze').map((edit) => edit.id)).toEqual([
    'next',
    'eof',
  ]);
  expect(buildReviewTimeMap(10, tail.edits).at(-1)!.resultEnd).toBe(6);
  expect(tail.result).toEqual({ start: 10, end: 16 });
  expect(edits).toEqual(before);
});

it.each([
  [{ start: 2, end: 4.5 }, { start: 2, end: 3 }, 1.5],
  [{ start: 4.5, end: 5 }, { start: 3, end: 3 }, 0.5],
  [{ start: 4.5, end: 8 }, { start: 3, end: 7 }, 1.5],
  [{ start: 4, end: 6 }, { start: 3, end: 3 }, 2],
  [{ start: 6, end: 7 }, { start: 5, end: 6 }, 0],
] as const)(
  'exports result range %j including the exact retained hold portion',
  (result, source, holdDuration) => {
    const edits: ReviewEdit[] = [
      {
        id: 'hold',
        kind: 'freeze',
        start: 3,
        end: 3,
        requestedStart: 3,
        requestedEnd: 3,
        duration: 3,
        frameTime: 2.96,
        frameDuration: 0.04,
      },
      { id: 'cut', kind: 'cut', start: 3, end: 5, requestedStart: 3, requestedEnd: 5 },
    ];
    const selection = { kind: 'range' as const, ...source, result };
    const fragment = createReviewFragment({ ...input, edits, snapToKeyframes: false, selection });
    expect(fragment).toMatchObject({ ...result, result });
    const map = buildReviewTimeMap(input.duration, fragment!.edits);
    expect(map.at(-1)!.resultEnd).toBeCloseTo(result.end - result.start, 9);
    const holds = map.filter((segment) => segment.kind === 'freeze');
    if (holdDuration) {
      expect(holds).toHaveLength(1);
      expect(holds[0]).toMatchObject({ frameTime: 2.96, frameDuration: 0.04 });
      expect(holds[0]!.resultEnd - holds[0]!.resultStart).toBeCloseTo(holdDuration, 9);
    } else {
      expect(holds).toEqual([]);
    }
    expect(edits[0]).toMatchObject({ duration: 3 });
  }
);

it.each([
  { start: 3, end: 3 },
  { start: -0.1, end: 3 },
  { start: 0, end: 11 },
  { start: 0, end: NaN },
])(
  'rejects an invalid exact result range %j instead of exporting the source fallback',
  (result) => {
    expect(
      createReviewFragment({
        ...input,
        snapToKeyframes: false,
        selection: { ...input.selection, result },
      })
    ).toBeNull();
  }
);

it('keeps the maximum hold duration at a fractional insertion point', () => {
  const at = 424.3666666666667;
  const hold: ReviewEdit = {
    id: 'hold',
    kind: 'freeze',
    start: at,
    end: at,
    requestedStart: at,
    requestedEnd: at,
    duration: 600,
    frameTime: at,
    frameDuration: 1 / 30,
  };
  const selection = {
    kind: 'range' as const,
    start: at,
    end: at,
    result: { start: at, end: at + hold.duration },
  };
  const fragment = createReviewFragment({
    ...input,
    duration: 450,
    edits: [hold],
    snapToKeyframes: false,
    selection,
  });

  expect(fragment?.edits).toContainEqual(hold);
});
