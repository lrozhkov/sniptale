import { expect, it } from 'vitest';
import { createQuickEditZoomRegion } from './advanced/zoom';
import { createQuickEditSpotlight } from './advanced/focus';
import { reconcileReviewFocus } from './focus-edits';
import type { ReviewEdit } from './types';

const cut = (start: number, end: number): ReviewEdit => ({
  id: 'cut',
  kind: 'cut',
  start,
  end,
  requestedStart: start,
  requestedEnd: end,
});
const focus = (id: string, start: number, end: number) =>
  createQuickEditZoomRegion({ id, at: start, duration: end - start });

it('removes partial intersections for both effects, preserves touching boundaries and breaks a cut gap', () => {
  const regions = [
    { ...focus('left', 0, 2), linkTo: 'right', linkEasing: 'linear' as const },
    { ...focus('inside', 2, 3), spotlight: createQuickEditSpotlight() },
    focus('partial', 3, 5),
    focus('right', 6, 8),
  ];
  expect(
    reconcileReviewFocus({ regions, duration: 12, before: [], after: [cut(2, 4)], edit: cut(2, 4) })
  ).toEqual([focus('left', 0, 2), focus('right', 4, 6)]);
});

it('preserves unrelated links and source anchors across cut changes with existing speed', () => {
  const speed: ReviewEdit = { ...cut(0, 4), id: 'speed', kind: 'speed', rate: 2, audio: 'speed' };
  const regions = [{ ...focus('a', 5, 6), linkTo: 'b' }, focus('b', 7, 8)];
  const before = [speed];
  const after = [speed, cut(4, 6)];
  const changed = reconcileReviewFocus({ regions, duration: 12, before, after, edit: cut(4, 6) });
  expect(changed).toEqual([{ ...focus('a', 3, 4), linkTo: 'b' }, focus('b', 5, 6)]);
  expect(
    reconcileReviewFocus({
      regions: changed,
      duration: 12,
      before: after,
      after: before,
      edit: null,
    })
  ).toEqual(regions);
  const moved = cut(10, 11);
  expect(
    reconcileReviewFocus({
      regions: changed,
      duration: 12,
      before: after,
      after: [speed, moved],
      edit: moved,
    })
  ).toEqual(regions);
});

it('anchors focus when a speed edit is inserted or changed and does not revive dormant regions', () => {
  const speed: ReviewEdit = { ...cut(0, 4), kind: 'speed', rate: 2, audio: 'speed' };
  const dormant = { ...focus('dormant', 20, 22), dormant: true };
  const regions = [focus('active', 2, 6), dormant];
  expect(
    reconcileReviewFocus({ regions, duration: 12, before: [], after: [speed], edit: speed })
  ).toEqual([focus('active', 1, 4), dormant]);
});
