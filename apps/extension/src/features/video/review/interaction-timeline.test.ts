import { expect, it } from 'vitest';
import {
  parseReviewInteractionTimeline,
  resolveReviewInteractions,
  reviewInteractionSourceQueries,
} from './interaction-timeline';

import type { ReviewAuthoredPress } from './interaction-types';
import type { ReviewTelemetryMarker } from './telemetry';

const press = (id: string, family: 'keyboard' | 'mouse'): ReviewAuthoredPress => ({
  id,
  family,
  start: 2,
  end: 3,
  label: family === 'keyboard' ? 'Cmd+K' : 'Click',
  ...(family === 'keyboard' ? { keys: ['Cmd', 'K'] } : {}),
  button: 0,
  x: 0.25,
  y: 0.75,
});

it('roundtrips authored keyboard and mouse data without changing capture facts', () => {
  const captured: ReviewTelemetryMarker = {
    ref: { kind: 'action', id: 'captured' },
    eventType: 'CLICK',
    target: 'Captured',
    start: 1,
    end: 1.2,
  };
  const before = structuredClone(captured);
  const raw = { presses: [press('keys', 'keyboard'), press('mouse', 'mouse')], overrides: [] };
  const parsed = parseReviewInteractionTimeline(JSON.parse(JSON.stringify(raw)));
  expect(parsed).toEqual(raw);
  const result = resolveReviewInteractions([captured], parsed!);
  expect(result.map((m) => m.ref.id)).toEqual(['captured', 'keys', 'mouse']);
  expect(result.find((m) => m.ref.id === 'keys')).toMatchObject({
    eventType: 'KEY',
    target: 'Cmd+K',
    audio: { family: 'keyboard' },
  });
  expect(result.find((m) => m.ref.id === 'mouse')).toMatchObject({
    eventType: 'CLICK',
    focusPoint: { x: 0.25, y: 0.75 },
  });
  expect(captured).toEqual(before);
});

it.each([
  { presses: [press('same', 'mouse'), press('same', 'keyboard')], overrides: [] },
  { presses: [{ ...press('bad', 'mouse'), end: 2 }], overrides: [] },
  { presses: [{ ...press('bad', 'mouse'), x: Infinity }], overrides: [] },
  { presses: [{ ...press('bad', 'mouse'), y: -0.1 }], overrides: [] },
  { presses: [{ ...press('bad', 'keyboard'), keys: [''] }], overrides: [] },
  {
    presses: [],
    overrides: [{ ref: { kind: 'unknown', id: 'x' }, start: 0, end: 1, enabled: true }],
  },
])('rejects invalid authored input at admission: %j', (value) => {
  expect(parseReviewInteractionTimeline(value)).toBeNull();
});

it('uses per-lane visibility and the legacy actions fallback independently', () => {
  const timeline = { presses: [press('keys', 'keyboard'), press('mouse', 'mouse')], overrides: [] };
  expect(resolveReviewInteractions([], timeline, { keyboard: false }).map((m) => m.ref.id)).toEqual(
    ['mouse']
  );
  expect(
    resolveReviewInteractions([], timeline, { actions: false, keyboard: true }).map((m) => m.ref.id)
  ).toEqual(['keys']);
  expect(resolveReviewInteractions([], timeline, { actions: false })).toEqual([]);
});

it('retains copied source data once when archived capture facts are unavailable', () => {
  const source = press('retained', 'mouse');
  const timeline = {
    presses: [],
    overrides: [
      { ref: { kind: 'action' as const, id: source.id }, start: 8, end: 9, enabled: true, source },
    ],
  };
  const parsed = parseReviewInteractionTimeline(timeline)!;
  const markers = resolveReviewInteractions([], parsed);
  expect(markers).toHaveLength(1);
  expect(markers[0]).toMatchObject({ start: 8, end: 9, target: 'Click' });
  expect(resolveReviewInteractions(markers, parsed)).toHaveLength(1);
  expect(
    resolveReviewInteractions([], {
      ...parsed,
      overrides: [{ ...parsed.overrides[0]!, enabled: false }],
    })
  ).toEqual([]);
});

it('remaps gesture timing with authored duration and leaves the original unchanged', () => {
  const captured: ReviewTelemetryMarker = {
    ref: { kind: 'action', id: 'gesture' },
    eventType: 'CLICK',
    target: 'Click',
    start: 2,
    end: 4,
    gesture: {
      id: 'gesture',
      type: 'click',
      button: 0,
      completion: 'complete',
      downTime: 2,
      upTime: 3,
      observedEndTime: 4,
    },
  };
  const result = resolveReviewInteractions([captured], {
    presses: [],
    overrides: [{ ref: captured.ref, start: 10, end: 14, enabled: true }],
  });
  expect(result[0]).toMatchObject({
    start: 10,
    end: 14,
    gesture: { downTime: 10, upTime: 12, observedEndTime: 14 },
  });
  expect(captured.gesture?.upTime).toBe(3);
});

it('retimes decoded legacy keyboard attacks in seconds through the real sound planner', async () => {
  const { encodeRecordingKeyboardRhythm } = await import('../project/keyboard-rhythm');
  const { buildReviewActionAudioPlan, iterateReviewActionAudioCues } =
    await import('./action-audio');
  const { buildReviewTimeMap } = await import('./timeline');
  const original: ReviewTelemetryMarker = {
    ref: { kind: 'signal', id: 'typing' },
    eventType: 'typing',
    start: 1,
    end: 2,
    audio: { family: 'typing' },
    keyboardRhythm: [encodeRecordingKeyboardRhythm('rhythm', [1, 1.5])],
  };
  const before = structuredClone(original);
  for (const [end, expected] of [
    [3, [2, 2.5]],
    [4, [2, 3]],
  ] as const) {
    const markers = resolveReviewInteractions([original], {
      presses: [],
      overrides: [{ ref: original.ref, start: 2, end, enabled: true }],
    });
    const plan = buildReviewActionAudioPlan({
      markers,
      settings: [
        {
          ref: { kind: 'signal', id: 'typing' },
          enabled: true,
          presetId: 'typing-recorded-v2',
          includeRepeats: true,
          volume: 0.5,
          offset: 0,
        },
      ],
      segments: buildReviewTimeMap(6, []),
      applied: true,
    });
    const cues = [...iterateReviewActionAudioCues(plan, { start: 0, end: 6 })].flat();
    expect(cues.map((cue) => cue.start)).toEqual(expected);
  }
  expect(original).toEqual(before);
});

it('retains bounded original lookup ranges and rejects malformed ranges at admission', () => {
  const raw = {
    presses: [],
    overrides: [
      {
        ref: { kind: 'signal', id: 'typing' },
        start: 10,
        end: 11,
        enabled: true,
        sourceRange: { start: 1, end: 2 },
      },
    ],
  };
  expect(parseReviewInteractionTimeline(raw)).toEqual(raw);
  for (const sourceRange of [
    { start: -1, end: 2 },
    { start: 3, end: 2 },
    { start: NaN, end: 2 },
    { start: 1 },
  ])
    expect(
      parseReviewInteractionTimeline({ ...raw, overrides: [{ ...raw.overrides[0], sourceRange }] })
    ).toBeNull();
});

it('maps only the intersecting destination interval back to original archive time', () => {
  const timeline = {
    presses: [],
    overrides: [
      {
        ref: { kind: 'signal' as const, id: 'typing' },
        start: 100,
        end: 120,
        enabled: true,
        sourceRange: { start: 10, end: 20 },
      },
    ],
  };
  expect(reviewInteractionSourceQueries(timeline, { start: 105, end: 110 })).toEqual([
    { ref: timeline.overrides[0]!.ref, range: { start: 12.5, end: 15 } },
  ]);
  expect(reviewInteractionSourceQueries(timeline, { start: 0, end: 10 })).toEqual([]);
  timeline.overrides[0]!.enabled = false;
  expect(reviewInteractionSourceQueries(timeline, { start: 105, end: 110 })).toEqual([]);
  expect(reviewInteractionSourceQueries(undefined, { start: 0, end: 10 })).toEqual([]);
});
