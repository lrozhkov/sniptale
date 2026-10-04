import { expect, it } from 'vitest';
import { createQuickEditZoomRegion } from './advanced/zoom';
import { createQuickEditSpotlight } from './advanced/focus';
import { evaluateQuickEditCameraAtTime } from './advanced/scene';
import { projectReviewFocus, reconcileReviewFocus } from './focus-edits';
import { buildReviewTimeMap } from './timeline';
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

it('retains authored focus and link through a partial and full cut, then restores placement', () => {
  const regions = [
    { ...focus('first', 1, 3), linkTo: 'second', linkEasing: 'linear' as const },
    { ...focus('second', 4, 6), spotlight: createQuickEditSpotlight() },
  ];
  const removed = cut(2, 6);
  const hidden = reconcileReviewFocus({
    regions,
    duration: 10,
    before: [],
    after: [removed],
    edit: removed,
    preserveUnderCuts: true,
  });
  expect(hidden).toMatchObject([
    { id: 'first', linkTo: 'second', linkEasing: 'linear', sourceAnchor: { start: 1, end: 3 } },
    { id: 'second', sourceAnchor: { start: 4, end: 6 } },
  ]);
  expect(projectReviewFocus(hidden, buildReviewTimeMap(10, [removed]))).toMatchObject([
    { id: 'first', start: 1, end: 2 },
  ]);
  expect(
    reconcileReviewFocus({
      regions: hidden,
      duration: 10,
      before: [removed],
      after: [],
      edit: null,
      preserveUnderCuts: true,
    })
  ).toMatchObject(regions);
});

it('does not replay focus transitions at an internal cut boundary', () => {
  const authored = { ...focus('held', 1, 5), sourceAnchor: { start: 1, end: 5 } };
  const slices = projectReviewFocus([authored], buildReviewTimeMap(8, [cut(2, 4)]));
  expect(slices).toHaveLength(2);
  expect(slices[0]?.exit.type).toBe('none');
  expect(slices[1]?.enter.type).toBe('none');
  expect(evaluateQuickEditCameraAtTime(slices, 1.9)).toEqual(authored.transform);
  expect(evaluateQuickEditCameraAtTime(slices, 2.1)).toEqual(authored.transform);
  expect(authored.enter.type).not.toBe('none');
  expect(authored.exit.type).not.toBe('none');
});

it('projects authored focus transitions with video Speed without changing source duration', () => {
  const authored = { ...focus('held', 2, 6), sourceAnchor: { start: 2, end: 6 } };
  const speed: ReviewEdit = { ...cut(2, 6), kind: 'speed', rate: 2, audio: 'speed' };
  const projected = projectReviewFocus([authored], buildReviewTimeMap(10, [speed]));
  expect(projected[0]).toMatchObject({ start: 2, end: 4 });
  expect(projected[0]!.enter.duration).toBeCloseTo(0.15);
  expect(projected[0]!.exit.duration).toBeCloseTo(0.15);
  expect(authored.enter.duration).toBe(0.3);
  expect(authored.sourceAnchor).toEqual({ start: 2, end: 6 });
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

it('projects fitted legacy phases through mixed Speed without mutating authored history', () => {
  const original = {
    ...focus('legacy', 0, 10),
    sourceAnchor: { start: 0, end: 10 },
    enter: { type: 'linear' as const, duration: 8 },
    exit: { type: 'linear' as const, duration: 8 },
  };
  const map = buildReviewTimeMap(10, [
    {
      id: 'speed',
      kind: 'speed',
      start: 0,
      end: 5,
      requestedStart: 0,
      requestedEnd: 5,
      rate: 2,
      audio: 'speed',
    },
  ]);
  const projected = projectReviewFocus([original], map);
  expect(projected[0]).toMatchObject({
    start: 0,
    end: 7.5,
    enter: { duration: 2.5 },
    exit: { duration: 5 },
  });
  expect(evaluateQuickEditCameraAtTime(projected, 1.25).scale).toBeCloseTo(1.25);
  expect(evaluateQuickEditCameraAtTime(projected, 2.5).scale).toBeCloseTo(1.5);
  expect(evaluateQuickEditCameraAtTime(projected, 5).scale).toBeCloseTo(1.25);
  expect(original.enter.duration).toBe(8);
});

it('bounds output phases by each surviving cut slice', () => {
  const original = {
    ...focus('cut', 0, 10),
    sourceAnchor: { start: 0, end: 10 },
    enter: { type: 'linear' as const, duration: 5 },
    exit: { type: 'linear' as const, duration: 5 },
  };
  const projected = projectReviewFocus([original], buildReviewTimeMap(10, [cut(2, 4)]));
  expect(projected).toHaveLength(2);
  expect(projected[0]).toMatchObject({
    start: 0,
    end: 2,
    enter: { duration: 2 },
    exit: { type: 'none', duration: 0 },
  });
  expect(projected[1]).toMatchObject({
    start: 2,
    end: 8,
    enter: { type: 'none', duration: 0 },
    exit: { duration: 5 },
  });
  for (const item of projected)
    expect(item.enter.duration + item.exit.duration).toBeLessThanOrEqual(item.end - item.start);
  expect(original.enter.duration).toBe(5);
});
