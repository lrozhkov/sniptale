import { expect, it } from 'vitest';
import {
  planReviewCutTransitions,
  reviewCutTransitionAt,
  createReviewCut,
  createReviewSpeed,
  nearestReviewBoundary,
  placeReviewEditMove,
  reviewPlaybackTime,
  reviewPlaybackSettings,
} from './cuts';
const input = {
  id: 'cut',
  selection: { kind: 'range' as const, start: 1.8, end: 4.2 },
  boundaries: [0, 2, 4, 6],
  duration: 6,
  edits: [],
};
it('supports full-video speed and source-aligned sound policy without allowing overlapping cuts', () => {
  const speed = createReviewSpeed({ ...input, rate: 2, audio: 'mute' })!;
  expect(speed).toMatchObject({ kind: 'speed', start: 2, end: 4, rate: 2, audio: 'mute' });
  expect(createReviewCut({ ...input, edits: [speed] })).toMatchObject({
    kind: 'cut',
    start: 2,
    end: 4,
  });
  expect(
    createReviewSpeed({
      ...input,
      rate: 4,
      audio: 'speed',
      selection: { kind: 'range', start: 0, end: 6 },
    })
  ).not.toBeNull();
  const cut = { ...createReviewCut(input)!, start: 0, end: 2 };
  expect(reviewPlaybackSettings(1, [cut, speed])).toEqual({ time: 2, rate: 2, muted: true });
  expect(reviewPlaybackSettings(4, [cut, speed])).toEqual({ time: 4, rate: 1, muted: false });
});

it('places a whole edit only on a safe pair of the same length without same-kind overlap', () => {
  const current = createReviewCut({ ...input, selection: { kind: 'range', start: 0, end: 2 } })!;
  const context = {
    current,
    duration: 10,
    boundaries: [0, 2, 4, 7, 9, 10],
    edits: [current],
  };
  expect(placeReviewEditMove({ ...context, requestedStart: 4 })).toEqual({ start: 0, end: 2 });
  expect(placeReviewEditMove({ ...context, requestedStart: 7.1 })).toEqual({ start: 7, end: 9 });
  const neighbor = { ...current, id: 'neighbor', start: 7, end: 9 };
  expect(
    placeReviewEditMove({ ...context, edits: [current, neighbor], requestedStart: 7 })
  ).toEqual({ start: 0, end: 2 });
});
it('snaps to real boundaries and preserves requested timing', () => {
  expect(createReviewCut(input)).toEqual({
    id: 'cut',
    kind: 'cut',
    start: 2,
    end: 4,
    requestedStart: 1.8,
    requestedEnd: 4.2,
  });
  expect(nearestReviewBoundary(3, [0, 2, 4, 6])).toBe(2);
  expect(() => nearestReviewBoundary(1, [])).toThrow();
});
it('rejects empty/full or overlapping cuts and skips adjacent removed regions', () => {
  expect(createReviewCut({ ...input, selection: { kind: 'range', start: 0, end: 6 } })).toBeNull();
  expect(
    createReviewCut({ ...input, selection: { kind: 'range', start: 2, end: 2.1 } })
  ).toBeNull();
  expect(createReviewCut({ ...input, selection: { kind: 'point', time: 2 } })).toBeNull();
  const first = createReviewCut(input)!;
  expect(createReviewCut({ ...input, edits: [first] })).toBeNull();
  const second = { ...first, id: 'second', start: 4, end: 5 };
  expect(reviewPlaybackTime(3, [second, first])).toBe(5);
  expect(reviewPlaybackTime(1, [first])).toBe(1);
});

it('keeps exact source timing when keyframe snapping is disabled', () => {
  expect(
    createReviewCut({
      ...input,
      snapToKeyframes: false,
      selection: { kind: 'range', start: 0.3, end: 1.4 },
    })
  ).toMatchObject({ start: 0.3, end: 1.4 });
});

it('fits competing transitions in result time without mutating cuts or borrowing excluded islands', () => {
  const cut = (id: string, start: number, end: number) => ({
    id,
    kind: 'cut' as const,
    start,
    end,
    requestedStart: start,
    requestedEnd: end,
    transition: { type: 'dissolve' as const, before: 2, after: 2 },
  });
  const edits = [
    cut('a', 2, 4),
    cut('b', 6, 8),
    {
      id: 'speed',
      kind: 'speed' as const,
      start: 4,
      end: 6,
      requestedStart: 4,
      requestedEnd: 6,
      rate: 2 as const,
      audio: 'speed' as const,
    },
  ];
  const original = structuredClone(edits);
  const plans = planReviewCutTransitions(10, edits);
  expect(plans).toEqual([
    {
      id: 'a',
      type: 'dissolve',
      seam: 2,
      before: 2,
      after: 0.5,
      left: { start: 0, end: 2 },
      right: { start: 4, end: 6 },
    },
    {
      id: 'b',
      type: 'dissolve',
      seam: 3,
      before: 0.5,
      after: 2,
      left: { start: 4, end: 6 },
      right: { start: 8, end: 10 },
    },
  ]);
  expect(edits).toEqual(original);
  const asymmetric = planReviewCutTransitions(10, [
    { ...cut('a', 2, 4), transition: { type: 'dissolve', before: 2, after: 6 } },
    edits[1]!,
    edits[2]!,
  ]);
  expect(asymmetric[0]?.after).toBe(0.75);
  expect(asymmetric[1]?.before).toBe(0.25);
  expect(reviewCutTransitionAt(2.5, plans)?.plan.id).toBe('b');
  expect(reviewCutTransitionAt(5, plans)).toBeNull();
  expect(planReviewCutTransitions(10, [cut('a', 0, 2), cut('b', 2, 4), cut('c', 8, 10)])).toEqual(
    []
  );
  expect(planReviewCutTransitions(10, [])).toEqual([]);
});

it('evaluates asymmetric and one-sided transitions continuously within their fixed window', () => {
  const edit = {
    id: 'cut',
    kind: 'cut' as const,
    start: 3,
    end: 5,
    requestedStart: 3,
    requestedEnd: 5,
    transition: { type: 'fade-black' as const, before: 1, after: 2 },
  };
  const plans = planReviewCutTransitions(10, [edit]);
  expect(reviewCutTransitionAt(1.99, plans)).toBeNull();
  expect(reviewCutTransitionAt(2, plans)).toMatchObject({ incoming: 0, black: 0 });
  expect(reviewCutTransitionAt(3, plans)).toMatchObject({ incoming: 1 / 3, black: 1 });
  expect(reviewCutTransitionAt(4, plans)).toMatchObject({ incoming: 2 / 3, black: 0.5 });
  expect(reviewCutTransitionAt(5, plans)).toBeNull();
  const oneSide = planReviewCutTransitions(10, [
    { ...edit, transition: { ...edit.transition, before: 0 } },
  ]);
  expect(reviewCutTransitionAt(3, oneSide)).toMatchObject({ incoming: 0, black: 1 });
});

it('clips transition frame authority to a fragment and leaves old cuts unmodified', () => {
  const cut = (id: string, start: number, end: number) => ({
    id,
    kind: 'cut' as const,
    start,
    end,
    requestedStart: start,
    requestedEnd: end,
  });
  const plain = cut('middle', 4, 6);
  expect(planReviewCutTransitions(10, [plain])).toEqual([]);
  const configured = { ...plain, transition: { type: 'dissolve' as const, before: 2, after: 2 } };
  const plans = planReviewCutTransitions(10, [
    cut('fragment-start', 0, 3.75),
    configured,
    cut('fragment-end', 6.5, 10),
  ]);
  expect(plans).toEqual([
    {
      id: 'middle',
      type: 'dissolve',
      seam: 0.25,
      before: 0.25,
      after: 0.5,
      left: { start: 3.75, end: 4 },
      right: { start: 6, end: 6.5 },
    },
  ]);
  expect(configured.transition).toEqual({ type: 'dissolve', before: 2, after: 2 });
});
