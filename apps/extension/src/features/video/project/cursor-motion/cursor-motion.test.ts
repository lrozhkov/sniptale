import { expect, it } from 'vitest';
import {
  parseCursorMotions,
  evaluateCursorMotion,
  withCursorMotionPath,
  cursorMotionSegment,
  type CursorMotion,
} from './index';
import { evaluateReviewCursorFocus } from '../../review/advanced/cursor-focus-path';
import { resolveQuickEditEffectiveState } from '../../review/advanced/effective';
import { createQuickEditAdvancedState } from '../../review/advanced/defaults';
import { createQuickEditZoomRegion } from '../../review/advanced/zoom';
import { loadQuickEditAdvancedState } from '../../review/advanced/validation';
const motion: CursorMotion = {
  id: 'motion',
  start: 2,
  end: 5,
  enabled: true,
  shape: 'arrow',
  size: 48,
  color: '#000000',
  outline: '#ffffff',
  shadow: true,
  easing: 'smooth',
  points: [
    { id: 'a', at: 0, x: 0.7, y: 0.8 },
    { id: 'b', at: 0.5, x: 0.6, y: 0.3 },
    { id: 'c', at: 1, x: 0.9, y: 0.5 },
  ],
};
it('roundtrips authored cursor data without retaining unknown payload fields', () => {
  expect(parseCursorMotions(JSON.parse(JSON.stringify([motion])))).toEqual([motion]);
  expect(
    parseCursorMotions([{ ...motion, untrusted: { url: 'https://invalid.test' } }])
  ).toBeNull();
  expect(
    parseCursorMotions([
      { ...motion, points: motion.points.map((p) => ({ ...p, extra: 'payload' })) },
    ])
  ).toBeNull();
});
it('refuses ambiguous intervals, identities, coordinates and unsupported appearance before persistence', () => {
  for (const invalid of [
    { ...motion, id: ' padded ' },
    { ...motion, start: NaN },
    { ...motion, end: Infinity },
    { ...motion, shape: 'script' },
    { ...motion, size: 0 },
    { ...motion, color: 'url(file)' },
    { ...motion, points: [{ ...motion.points[0]!, x: 2 }, motion.points[2]!] },
    { ...motion, points: [motion.points[0], motion.points[0], motion.points[2]] },
  ])
    expect(parseCursorMotions([invalid])).toBeNull();
  expect(parseCursorMotions([motion, { ...motion, id: 'overlap' }])).toBeNull();
  expect(
    parseCursorMotions([motion, { ...motion, id: 'adjacent', start: 5, end: 8 }])
  ).not.toBeNull();
});
it('uses the same authored curve for drawing and camera with a half-open interval and immutable recorded facts', () => {
  const recorded = {
    version: 1 as const,
    mode: 'follow' as const,
    smoothing: 0.9,
    sensitivity: 0.5,
    gapPolicy: 'hold' as const,
    segments: [
      {
        ...cursorMotionSegment({
          ...motion,
          id: 'recorded',
          start: 0,
          end: 10,
          easing: 'linear',
          points: [
            { id: 'r0', at: 0, x: 0.1, y: 0.1 },
            { id: 'r1', at: 1, x: 0.2, y: 0.2 },
          ],
        }),
      },
    ],
  };
  const before = structuredClone(recorded);
  const path = withCursorMotionPath(recorded, [motion])!;
  for (const time of [2, 2.1, 2.7, 3.5, 4.9]) {
    const drawn = evaluateCursorMotion([motion], time)!;
    expect(evaluateReviewCursorFocus(path, time)).toMatchObject({ x: drawn.x, y: drawn.y });
  }
  for (const time of [0, 1.9, 5, 8, 10])
    expect(evaluateReviewCursorFocus(path, time)).toMatchObject({
      x: evaluateReviewCursorFocus(recorded, time)!.x,
      y: evaluateReviewCursorFocus(recorded, time)!.y,
    });
  expect(evaluateCursorMotion([motion], 5)).toBeNull();
  expect(recorded).toEqual(before);
});
it('disables drawing and camera override together, persists the switch and restores the recorded camera path', () => {
  const state = createQuickEditAdvancedState();
  state.ui.mode = 'advanced';
  state.ui.tracks.zoom = true;
  state.zoom = {
    enabled: true,
    regions: [
      { ...createQuickEditZoomRegion({ id: 'zoom', at: 0, duration: 10 }), followCursor: true },
    ],
  };
  state.cursorMotions = [motion];
  state.cursorFocusPath = {
    version: 1,
    mode: 'follow',
    smoothing: 0.5,
    sensitivity: 0.5,
    gapPolicy: 'hold',
    segments: [cursorMotionSegment({ ...motion, id: 'recorded', start: 0, end: 10 })],
  };
  const loaded = loadQuickEditAdvancedState(
    JSON.parse(JSON.stringify({ ...state, cursorMotionEnabled: false }))
  )!;
  expect(loaded).not.toBeNull();
  const off = resolveQuickEditEffectiveState(loaded);
  expect(off.cursorMotions).toBeUndefined();
  expect(off.zoomRegions[0]!.cursorFocus!.path.segments).toEqual(state.cursorFocusPath.segments);
  const on = resolveQuickEditEffectiveState({ ...loaded, cursorMotionEnabled: true });
  expect(on.cursorMotions).toEqual([motion]);
  expect(on.zoomRegions[0]!.cursorFocus!.path.segments.some((s) => s.id === motion.id)).toBe(true);
  expect(loadQuickEditAdvancedState({ ...state, cursorMotionEnabled: 'false' })).toBeNull();
  const { cursorMotions: _motions, ...old } = state;
  expect(loadQuickEditAdvancedState({ ...old, schemaVersion: 28 })).not.toBeNull();
});
