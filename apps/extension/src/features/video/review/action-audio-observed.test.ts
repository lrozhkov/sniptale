import { expect, it } from 'vitest';
import { buildReviewActionAudioPlan, iterateReviewActionAudioCues } from './action-audio';
import { buildReviewTimeMap } from './timeline';
import { encodeRecordingKeyboardRhythm } from '../project/keyboard-rhythm';
import type { ReviewTelemetryMarker } from './telemetry';
import { isRecordingTelemetrySignal } from '../project/validation/recording-telemetry';

it('rejects duplicate block identities before preview can lose an otherwise accepted physical attack', () => {
  const keyboardRhythm = [
    encodeRecordingKeyboardRhythm('same', [1]),
    encodeRecordingKeyboardRhythm('same', [1.01]),
  ];
  const cues = collect(
    {
      ref: { kind: 'signal', id: 'typing' },
      eventType: 'typing',
      start: 1,
      end: 2,
      keyboardRhythm,
    },
    'typing-recorded-v2'
  );
  expect(cues.map((cue) => cue.start)).toEqual([1, 1.01]);
  // A native preview queue deduplicates IDs; offline PCM mixing consumes both attacks.
  expect(new Set(cues.map((cue) => cue.id)).size).toBe(1);
  expect(
    isRecordingTelemetrySignal({
      id: 'typing',
      kind: 'typing',
      startTime: 1,
      endTime: 2,
      point: null,
      data: {},
      keyboardRhythm,
    })
  ).toBe(false);
});

const collect = (
  marker: ReviewTelemetryMarker,
  presetId:
    | 'mouse-classic-paired-v2'
    | 'mouse-soft-paired-v2'
    | 'typing-recorded-v2'
    | 'keyboard-recorded-v2',
  edits: Parameters<typeof buildReviewTimeMap>[1] = []
) => {
  const plan = buildReviewActionAudioPlan({
    markers: [marker],
    settings: [
      {
        ref: { kind: marker.ref.kind === 'signal' ? 'signal' : 'action', id: marker.ref.id },
        enabled: true,
        presetId,
        volume: 0.5,
        offset: 0,
      },
    ],
    segments: buildReviewTimeMap(8, edits),
    applied: true,
  });
  return [...iterateReviewActionAudioCues(plan, { start: 0, end: plan.duration })].flat();
};
it('projects surviving observed release independently without manufacturing a press at the cut', () => {
  const marker: ReviewTelemetryMarker = {
    ref: { kind: 'action', id: 'gesture' },
    eventType: 'DRAG',
    start: 1,
    end: 5,
    gesture: {
      id: 'gesture',
      type: 'drag',
      downTime: 1,
      upTime: 5,
      completion: 'released',
      button: 0,
    },
  };
  const cues = collect(marker, 'mouse-classic-paired-v2', [
    { id: 'cut', kind: 'cut', start: 0, end: 2, requestedStart: 0, requestedEnd: 2 },
  ]);
  expect(cues).toHaveLength(1);
  expect(cues[0]).toMatchObject({ sampleId: 'mouse-click-03-v1', start: 3, rate: 1 });
  delete marker.gesture!.upTime;
  expect(collect(marker, 'mouse-classic-paired-v2')).toHaveLength(1);
});
it('preserves actual rapid keyboard attacks and pauses without filling input-only intervals', () => {
  const marker: ReviewTelemetryMarker = {
    ref: { kind: 'signal', id: 'typing' },
    eventType: 'typing',
    start: 1,
    end: 5,
    keyboardRhythm: [encodeRecordingKeyboardRhythm('block', [1, 1.01, 1.02, 3, 3.1])],
  };
  expect(collect(marker, 'typing-recorded-v2').map((c) => c.start)).toEqual([
    1, 1.01, 1.02, 3, 3.1,
  ]);
  delete marker.keyboardRhythm;
  expect(collect(marker, 'typing-recorded-v2')).toEqual([]);
});
it('does not play protected or input-only activity in recorded mode and repeats are explicit', () => {
  const marker: ReviewTelemetryMarker = {
    ref: { kind: 'signal', id: 'typing' },
    eventType: 'typing',
    start: 1,
    end: 4,
    keyboardRhythm: [encodeRecordingKeyboardRhythm('press', [1])],
    keyboardRepeats: [encodeRecordingKeyboardRhythm('repeat', [1.1, 1.2])],
  };
  expect(collect(marker, 'typing-recorded-v2').map((c) => c.start)).toEqual([1]);
  const repeated = buildReviewActionAudioPlan({
    markers: [marker],
    settings: [
      {
        ref: { kind: 'signal', id: 'typing' },
        enabled: true,
        presetId: 'typing-recorded-v2',
        volume: 0.5,
        offset: 0,
        includeRepeats: true,
      },
    ],
    segments: buildReviewTimeMap(8, []),
    applied: true,
  });
  const starts = [...iterateReviewActionAudioCues(repeated, { start: 0, end: 8 })]
    .flat()
    .map((cue) => cue.start);
  expect(starts).toHaveLength(3);
  starts.forEach((time, index) => expect(time).toBeCloseTo(1 + index * 0.1, 12));
  marker.privacy = 'protected';
  expect(collect(marker, 'typing-recorded-v2')).toEqual([]);
});

it('retains compact blocks for long recordings and queries late windows without expanding a saved schedule', () => {
  const times = Array.from({ length: 10000 }, (_, index) => 1 + index * 0.1);
  const blocks = Array.from({ length: 3 }, (_, index) =>
    encodeRecordingKeyboardRhythm(`long:${index}`, times.slice(index * 4096, (index + 1) * 4096))
  );
  const marker: ReviewTelemetryMarker = {
    ref: { kind: 'signal', id: 'long' },
    eventType: 'typing',
    start: 1,
    end: 1001,
    keyboardRhythm: blocks,
  };
  const plan = buildReviewActionAudioPlan({
    markers: [marker],
    settings: [
      {
        ref: { kind: 'signal', id: 'long' },
        enabled: true,
        presetId: 'typing-recorded-v2',
        volume: 0.5,
        offset: 0,
      },
    ],
    segments: buildReviewTimeMap(1200, []),
    applied: true,
  });
  expect(plan.descriptors).toHaveLength(3);
  expect(blocks.every((block) => block.ticks.length <= 4)).toBe(true);
  const query = () =>
    [...iterateReviewActionAudioCues(plan, { start: 999.95, end: 1000.25 })].flat();
  const cues = query().filter((cue) => cue.start >= 999.95);
  expect(cues).toHaveLength(3);
  cues.forEach((cue, index) => expect(cue.start).toBeCloseTo(1000 + index * 0.1, 9));
  expect(query()).toEqual(query());
});

it.each(['KEY_HOLD', 'KEY_MODIFIERS'])(
  'keeps one physical attack for %s without implicit autorepeat sounds',
  (eventType) => {
    const marker: ReviewTelemetryMarker = {
      ref: { kind: 'action', id: 'command' },
      eventType,
      target: 'Ctrl+Shift',
      start: 1,
      end: 2,
      keyboardAttack: { id: 'command:down', time: 1 },
      keyboardRepeats: [encodeRecordingKeyboardRhythm('repeat', [1.1, 1.2])],
    };
    expect(collect(marker, 'keyboard-recorded-v2').map((cue) => cue.start)).toEqual([1]);
    marker.keyboardHold = true;
    expect(collect(marker, 'keyboard-recorded-v2')).toEqual([]);
    delete marker.keyboardHold;
    marker.privacy = 'protected';
    expect(collect(marker, 'keyboard-recorded-v2')).toEqual([]);
  }
);

it.each([
  ['mouse-classic-paired-v2', 'mouse-click-v1', 'mouse-click-03-v1'],
  ['mouse-soft-paired-v2', 'mouse-click-03-v1', 'mouse-click-02-v1'],
] as const)(
  'combines distinct original clicks at the observed phases of %s',
  (preset, downSample, upSample) => {
    const marker: ReviewTelemetryMarker = {
      ref: { kind: 'action', id: 'physical-pair' },
      eventType: 'SELECTION_DRAG',
      start: 1,
      end: 1.5,
      gesture: {
        id: 'physical-pair',
        type: 'selection-drag',
        downTime: 1,
        upTime: 1.5,
        completion: 'released',
        button: 0,
      },
    };
    const cues = collect(marker, preset);
    expect(cues.map((cue) => [cue.sampleId, cue.start])).toEqual([
      [downSample, 1],
      [upSample, 1.5],
    ]);
    expect(new Set(cues.map((cue) => cue.id)).size).toBe(2);
  }
);
