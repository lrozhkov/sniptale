import { evaluateQuickEditCameraAtTime } from './advanced/scene';
import { reconcileReviewFocus, projectReviewFocus } from './focus-edits';
import { createQuickEditZoomRegion } from './advanced/zoom';
import { expect, it } from 'vitest';
import { buildReviewTimeMap, createReviewDisplayMap } from './timeline';
import type { ReviewEdit } from './types';
import {
  anchorReviewVisual,
  anchorReviewVisualDisplay,
  displayReviewVisualAnchor,
  parseReviewVisualAnchor,
  projectReviewVisualAnchor,
  type ReviewVisualPlacement,
} from './visual-anchor';

const speed: ReviewEdit = {
  id: 'speed',
  kind: 'speed',
  start: 0,
  end: 4,
  requestedStart: 0,
  requestedEnd: 4,
  rate: 2,
  audio: 'speed',
};
const freeze: ReviewEdit = {
  id: 'freeze',
  kind: 'freeze',
  start: 4,
  end: 4,
  requestedStart: 4,
  requestedEnd: 4,
  duration: 2,
  frameTime: 3.9,
  frameDuration: 0.1,
};
const cut: ReviewEdit = {
  id: 'cut',
  kind: 'cut',
  start: 3,
  end: 5,
  requestedStart: 3,
  requestedEnd: 5,
};

it('keeps the original Speed phase and Freeze offset when a CUT removes both', () => {
  const edits = [speed, freeze];
  const original = buildReviewTimeMap(8, edits);
  const placement = anchorReviewVisualDisplay(
    { start: 2, end: 7 },
    createReviewDisplayMap(8, edits)
  );
  expect(placement).toEqual(anchorReviewVisual({ start: 1, end: 5 }, original));
  const anchor = placement.visualAnchor!;
  expect(parseReviewVisualAnchor(anchor, 4)).toEqual(anchor);
  const edited = buildReviewTimeMap(8, [...edits, cut]);
  const visible = projectReviewVisualAnchor(anchor, edited);
  expect(visible).toEqual([
    { start: 1, end: 1.5, sourceStart: 2, sourceEnd: 3, offset: 0, rate: 1 },
  ]);
  expect(projectReviewVisualAnchor(anchor, edited)).toBe(visible);
  expect(projectReviewVisualAnchor(anchor, original).map((slice) => slice.offset)).toEqual([
    0, 1, 3,
  ]);
  const display = createReviewDisplayMap(8, edits);
  expect(displayReviewVisualAnchor(placement, display, 2)).toBe(5);
  const hidden = createReviewDisplayMap(8, [...edits, cut]);
  expect(displayReviewVisualAnchor(placement, hidden, 2)).toBe(5);
  expect(hidden.duration).toBe(display.duration);
  expect(hidden.displayToResult(5)).toBe(1.5);
  expect(displayReviewVisualAnchor(placement, createReviewDisplayMap(8, [speed]), 2)).toBe(4);
  expect(displayReviewVisualAnchor(placement, display, 4)).toBe(7);
  expect(displayReviewVisualAnchor({ start: 1, end: 5 }, display, 4)).toBe(7);
});

it('keeps a plate wholly inside a suppressed Freeze visible in display time', () => {
  const uncut = buildReviewTimeMap(8, [speed, freeze]);
  const motion = anchorReviewVisual<ReviewVisualPlacement>({ start: 2.25, end: 3.25 }, uncut);
  const edits = [speed, freeze, cut];
  const hidden = createReviewDisplayMap(8, edits);
  expect(displayReviewVisualAnchor(motion, hidden)).toBe(4.25);
  expect(displayReviewVisualAnchor(motion, hidden, 1)).toBe(5.25);
  expect(projectReviewVisualAnchor(motion.visualAnchor!, buildReviewTimeMap(8, edits))).toEqual([]);
});

it('refuses malformed saved spans and keeps legacy omission', () => {
  const span = { start: 1, end: 2, offset: 0, rate: 1 };
  expect(parseReviewVisualAnchor(undefined, 3)).toBeUndefined();
  for (const invalid of [
    false,
    [],
    [false],
    [{ ...span, start: NaN }],
    [{ ...span, end: 1 }],
    [{ ...span, offset: -1 }],
    [{ ...span, rate: 0 }],
    [{ ...span, rate: 101 }],
    [{ ...span, freezeId: 'missing-position' }],
    [{ ...span, freezeId: 'bad-rate', sourceTime: 2, rate: 2 }],
    [{ ...span, offset: 2.5 }],
    [span, { ...span, offset: 0.5 }],
  ]) {
    expect(parseReviewVisualAnchor(invalid, 3)).toBeNull();
  }
});

it('keeps a placement with no map coverage available for authored editing', () => {
  const item = { start: 10, end: 12 };
  expect(anchorReviewVisual(item, buildReviewTimeMap(8, []))).toBe(item);
});

it.each([false, true])('keeps the source focus entrance phase with Freeze=%s', (held) => {
  const entranceCut = { ...cut, start: 1.25, end: 1.5 };
  const focus = {
    ...createQuickEditZoomRegion({ id: 'focus', at: 1, duration: 5 }),
    sourceAnchor: { start: 1, end: 6 },
    enter: { type: 'linear' as const, duration: 1 },
  };
  const before = held ? [freeze] : [];
  const edits = [...before, entranceCut];
  const authored = reconcileReviewFocus({
    regions: [focus],
    duration: 8,
    before,
    after: edits,
    edit: entranceCut,
    preserveUnderCuts: true,
    preserveVisualAnchors: true,
  });
  const slices = projectReviewFocus(authored, buildReviewTimeMap(8, edits));
  expect(slices[1]?.start).toBe(1.25);
  expect(slices[1]?.phaseClock).toMatchObject({ offset: 0.5, enter: focus.enter });
  const original = projectReviewFocus([focus], buildReviewTimeMap(8, before));
  expect(evaluateQuickEditCameraAtTime(slices, 1.125).scale).toBeCloseTo(
    evaluateQuickEditCameraAtTime(original, 1.125).scale,
    9
  );
  expect(evaluateQuickEditCameraAtTime(slices, 1.25).scale).toBeCloseTo(
    evaluateQuickEditCameraAtTime(original, 1.5).scale,
    9
  );
});

it('keeps linked focus at full strength through internal slices on both sides of a connection', () => {
  const before = buildReviewTimeMap(8, []);
  const source = {
    ...createQuickEditZoomRegion({ id: 'from', at: 1, duration: 3 }),
    enter: { type: 'linear' as const, duration: 1 },
    exit: { type: 'linear' as const, duration: 1 },
    linkTo: 'to',
  };
  const target = {
    ...createQuickEditZoomRegion({ id: 'to', at: 6, duration: 2 }),
    enter: { type: 'linear' as const, duration: 1 },
  };
  const edits = [
    { ...cut, start: 3.5, end: 3.75 },
    { ...cut, id: 'second-cut', start: 6.1, end: 6.3 },
  ];
  const slices = projectReviewFocus(
    [anchorReviewVisual(source, before), anchorReviewVisual(target, before)],
    buildReviewTimeMap(8, edits)
  );
  expect(slices.slice(0, 2).map((slice) => slice.phaseClock?.exit.type)).toEqual(['none', 'none']);
  expect(slices.slice(2).map((slice) => slice.phaseClock?.enter.type)).toEqual(['none', 'none']);
  expect(evaluateQuickEditCameraAtTime(slices, 3.25).scale).toBeCloseTo(source.transform.scale, 9);
  expect(evaluateQuickEditCameraAtTime(slices, 6.1).scale).toBeCloseTo(target.transform.scale, 9);
});
