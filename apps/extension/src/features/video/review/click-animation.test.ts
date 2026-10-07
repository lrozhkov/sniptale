import { expect, it } from 'vitest';
import {
  REVIEW_CLICK_DEFAULT,
  patchReviewClicks,
  parseReviewClickAnimations,
} from './advanced/click-animation';
import { scheduleReviewClicks, evaluateReviewClicks } from './click-animation';
import { buildReviewTimeMap } from './timeline';
import { projectReviewTelemetry, type ReviewTelemetryMarker } from './telemetry';
import { createQuickEditAdvancedState, createQuickEditAdvancedContent } from './advanced/defaults';
import { loadQuickEditAdvancedContentState } from './advanced/validation';
import { replayReviewHistory, reviewAdvancedContentBaseline } from './document';
import { resolveQuickEditExportPlan } from './advanced/effective';

const marker: ReviewTelemetryMarker = {
  ref: { kind: 'action', id: 'click' },
  eventType: 'CLICK',
  start: 2.9,
  end: 2.9,
  focusPoint: { x: 0.2, y: 0.4 },
};
const animations = patchReviewClicks([], ['click'], {
  effect: 'ripple',
  before: 0.1,
  after: 1,
  offset: -0.05,
  x: 0.1,
});

it('strictly validates persisted styles, preserves legacy absence and canonical fixed points', () => {
  expect(parseReviewClickAnimations(undefined)).toBeUndefined();
  expect(parseReviewClickAnimations(animations)).toEqual(animations);
  for (const patch of [
    { after: NaN },
    { opacity: 2 },
    { offset: Infinity },
    { pulses: 1.5 },
    { radius: -1 },
    { effect: 'unknown' },
    { color: 'url(bad)' },
  ])
    expect(parseReviewClickAnimations([{ ...animations[0], ...patch }])).toBeNull();
  expect(parseReviewClickAnimations([animations[0], animations[0]])).toBeNull();
  const content = { ...createQuickEditAdvancedContent(), clickAnimations: animations };
  const loaded = loadQuickEditAdvancedContentState(JSON.parse(JSON.stringify(content)));
  expect(loaded).toEqual(content);
  expect(loadQuickEditAdvancedContentState(loaded)).toEqual(content);
  expect(loadQuickEditAdvancedContentState({ ...content, clickAnimations: [{}] })).toBeNull();
});

it('bulk changes preserve individual styles and reset only explicit identities', () => {
  const first = patchReviewClicks([], ['a'], { effect: 'glow', color: '#123456', radius: 80 });
  const both = patchReviewClicks(first, ['a', 'b'], { offset: -0.05 });
  expect(both[0]).toMatchObject({ effect: 'glow', color: '#123456ff', radius: 80, offset: -0.05 });
  expect(both[1]).toMatchObject({ ...REVIEW_CLICK_DEFAULT, id: 'b', offset: -0.05 });
  expect(first[0]!.offset).toBe(0);
  expect(patchReviewClicks(both, ['a'], null)).toEqual([both[1]]);
});

it('keeps result-time phases across speed boundaries and clamps only at cuts', () => {
  const segments = buildReviewTimeMap(8, [
    {
      id: 's',
      kind: 'speed',
      start: 3,
      end: 5,
      requestedStart: 3,
      requestedEnd: 5,
      rate: 2,
      audio: 'speed',
    },
    { id: 'c', kind: 'cut', start: 5, end: 6, requestedStart: 5, requestedEnd: 6 },
  ]);
  const original = structuredClone(marker);
  const cues = scheduleReviewClicks([marker], animations, segments);
  expect(cues[0]).toMatchObject({ anchor: 2.85, start: 2.75, end: 3.85, point: { y: 0.4 } });
  expect(cues[0]!.point.x).toBeCloseTo(0.3);
  expect(evaluateReviewClicks(cues, 3.5)).toHaveLength(1);
  const long = scheduleReviewClicks(
    [marker],
    patchReviewClicks(animations, ['click'], { after: 5 }),
    segments
  );
  expect(long[0]!.end).toBe(4);
  expect(evaluateReviewClicks(long, 4)).toEqual([]);
  expect(scheduleReviewClicks([{ ...marker, start: 5.5 }], animations, segments)).toEqual([]);
  expect(
    scheduleReviewClicks(
      [{ ref: marker.ref, eventType: marker.eventType, start: marker.start, end: marker.end }],
      animations,
      segments
    )
  ).toEqual([]);
  expect(marker).toEqual(original);
});

it('out-of-run offsets do not leak across cut boundaries and repeated pulses have stable phase', () => {
  const map = buildReviewTimeMap(8, [
    { id: 'c', kind: 'cut', start: 3, end: 6, requestedStart: 3, requestedEnd: 6 },
  ]);
  expect(
    scheduleReviewClicks(
      [marker],
      patchReviewClicks(animations, ['click'], { offset: 2, before: 0 }),
      map
    )
  ).toEqual([]);
  const cues = scheduleReviewClicks(
    [marker],
    patchReviewClicks(animations, ['click'], { offset: 0, before: 0, after: 1, pulses: 2 }),
    buildReviewTimeMap(8, [])
  );
  expect(evaluateReviewClicks(cues, 3.05)[0]!.opacity).toBeCloseTo(
    evaluateReviewClicks(cues, 3.55)[0]!.opacity
  );
  expect(evaluateReviewClicks(cues, 2)).toEqual([]);
  expect(evaluateReviewClicks(cues, 4)).toEqual([]);
});

it('semantic double click produces one identity/effect without changing captured telemetry', () => {
  const input = {
    cursorTrack: null,
    signals: [],
    actionEvents: [1, 2].map((count) => ({
      id: `click-${count}`,
      kind: 'CLICK' as const,
      time: 1 + count * 0.1,
      duration: 0,
      point: { x: 30, y: 40 },
      recordingPoint: { x: 0.3, y: 0.4 },
      label: '',
      data: { targetId: 'button', clickCount: count },
      preset: 'NONE' as const,
    })),
  };
  const copy = structuredClone(input);
  const projected = projectReviewTelemetry(input, 8);
  expect(projected.markers).toHaveLength(1);
  expect(projected.markers[0]!.eventType).toBe('DOUBLE_CLICK');
  expect(
    scheduleReviewClicks(
      projected.markers,
      patchReviewClicks([], ['click-1'], { effect: 'ripple' }),
      buildReviewTimeMap(8, [])
    )
  ).toHaveLength(1);
  expect(input).toEqual(copy);
});

it('undo/redo and baseline restore click settings; hidden lane does not disable export', () => {
  const before = createQuickEditAdvancedContent();
  const after = { ...before, clickAnimations: animations };
  const history = [{ id: 'op', at: 1, target: 'advancedContent' as const, before, after }];
  const source = { duration: 8, width: 640, height: 360, mimeType: 'video/mp4', size: 1 };
  expect(replayReviewHistory(history, 0, source).advancedContent).toEqual(before);
  expect(replayReviewHistory(history, 1, source).advancedContent).toEqual(after);
  const state = { ...createQuickEditAdvancedState(), ...after };
  expect(reviewAdvancedContentBaseline(state)).toEqual(after);
  const document = { edits: [], canvasComments: [] };
  expect(resolveQuickEditExportPlan({ advanced: state, document })).toMatchObject({
    video: 'copy',
  });
  state.ui.mode = 'advanced';
  state.ui.tracks.actions = false;
  expect(resolveQuickEditExportPlan({ advanced: state, document })).toMatchObject({
    video: 'render',
    reasons: ['click-animations'],
  });
});
