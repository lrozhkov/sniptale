import { expect, it } from 'vitest';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import type { ReviewCutTransitionPlan } from '../../features/video/review/cuts';
import {
  buildReviewPreviewBoundaries,
  nearestReviewCut,
  nextReviewCutDeadline,
} from './preview-boundaries';

const edits = [
  { kind: 'cut', id: 'skip', start: 6, end: 10, requestedStart: 6, requestedEnd: 10 },
] as const;
const segments = buildReviewTimeMap(20, edits);

it('prepares one independent source position across a removed span', () => {
  expect(buildReviewPreviewBoundaries(segments, [], [])).toEqual([
    { kind: 'cut', time: 6, incoming: { time: 10, segmentId: 'video:2' } },
  ]);
});

it.each(['dissolve', 'fade-black'] as const)(
  'retains the start, source jump and end of %s',
  (type) => {
    const plan: ReviewCutTransitionPlan = {
      id: 'skip',
      type,
      seam: 6,
      before: 0.5,
      after: 0.25,
      left: { start: 0, end: 6 },
      right: { start: 10, end: 20 },
    };
    expect(buildReviewPreviewBoundaries(segments, [plan], [])).toEqual([
      { kind: type, time: 5.5 },
      { kind: type, time: 6, incoming: { time: 10, segmentId: 'video:2' } },
      { kind: type, time: 6.25 },
    ]);
  }
);

it('prepares effect entry, exit start and the first ordinary frame after the effect', () => {
  const transform = { scale: 2, centerX: 0.5, centerY: 0.5 };
  expect(
    buildReviewPreviewBoundaries(
      segments,
      [],
      [
        {
          id: 'focus',
          start: 2,
          end: 4,
          transform,
          enter: { type: 'ease-in-out', duration: 0.5 },
          exit: { type: 'ease-in-out', duration: 0.75 },
        },
      ]
    )
  ).toEqual([
    { kind: 'effect-entry', time: 2 },
    { kind: 'effect-entry', time: 2.5 },
    { kind: 'effect-exit', time: 3.25 },
    { kind: 'effect-exit', time: 4 },
    { kind: 'cut', time: 6, incoming: { time: 10, segmentId: 'video:2' } },
  ]);
});

it('keeps adjacent cut deadlines when intake runs a paint late', () => {
  const frame = 1 / 30;
  const next = nextReviewCutDeadline(5.913, 6, 30, 0.09, 6 - 2 * frame);
  expect(next).toBeCloseTo(6 - frame, 8);
  expect(nextReviewCutDeadline(5.949, 6, 30, 0.09, next)).toBe(6);
});

it('keeps the deadline queue within its lookahead and skips expired deadlines', () => {
  expect(nextReviewCutDeadline(5.9, 6, 30, 0.09, 6 - 1 / 30)).toBeNull();
  expect(nextReviewCutDeadline(6.019, 6, 30, 0.09, 5.98)).toBe(6);
  expect(nextReviewCutDeadline(6.04, 6, 30, 0.09, 6)).toBeCloseTo(6 + 1 / 30, 8);
  expect(nextReviewCutDeadline(6.057, 6, 30, 0.09, 6)).toBeCloseTo(6 + 2 / 30, 8);
});

it('uses the closest incoming cut and targets its own nonaligned seam', () => {
  const map = buildReviewTimeMap(20, [
    ...edits,
    { kind: 'cut', id: 'second', start: 10.517, end: 13, requestedStart: 10.517, requestedEnd: 13 },
  ]);
  const plan = buildReviewPreviewBoundaries(map, [], []);
  expect(nearestReviewCut(plan, 5.95, 0.9)?.time).toBe(6);
  const upcoming = nearestReviewCut(plan, 6.44, 0.9);
  expect(upcoming?.incoming?.time).toBe(13);
  expect(upcoming?.time).toBeCloseTo(6.517, 8);
  expect(nextReviewCutDeadline(6.44, upcoming!.time, 30, 0.126, 6.5)).toBe(upcoming!.time);
});

it('starts lookahead at the first upcoming frame before filling the dissolve reserve', () => {
  expect(nextReviewCutDeadline(5.121, 6, 30, 0.175, null)).toBeCloseTo(5.1333333333, 8);
});
