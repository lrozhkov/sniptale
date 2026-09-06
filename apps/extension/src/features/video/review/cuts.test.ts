import { expect, it } from 'vitest';
import {
  createReviewCut,
  createReviewSpeed,
  nearestReviewBoundary,
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
  expect(createReviewCut({ ...input, edits: [speed] })).toBeNull();
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
