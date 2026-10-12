import { expect, it } from 'vitest';
import { buildReviewTimeMap } from './timeline';
import type { ReviewTelemetryMarker } from './telemetry';
import type { ReviewActionAudioSetting, ReviewActionAudioPreset } from './advanced/action-audio';
import {
  buildReviewActionAudioPlan,
  iterateReviewActionAudioCues,
  reviewActionAudioAdmission,
} from './action-audio';

const marker = (
  id: string,
  start: number,
  kind: 'mouse' | 'keyboard' | 'typing' = 'mouse',
  end = start + 0.1,
  keyCount = 1
): ReviewTelemetryMarker => ({
  ref: { kind: kind === 'typing' ? 'signal' : 'action', id },
  start,
  end,
  eventType: kind === 'mouse' ? 'CLICK' : kind === 'keyboard' ? 'KEY' : 'typing',
  audio: kind === 'keyboard' ? { family: kind, keyCount } : { family: kind },
});
const settings = (
  entry: ReviewTelemetryMarker,
  presetId: ReviewActionAudioPreset = 'mouse-classic-v1',
  offset = 0
): ReviewActionAudioSetting => {
  if (entry.ref.kind === 'cursor') throw new Error('fixture');
  return {
    ref: { kind: entry.ref.kind, id: entry.ref.id },
    enabled: true,
    presetId,
    volume: 0.35,
    offset,
  };
};
const collect = (
  plan: ReturnType<typeof buildReviewActionAudioPlan>,
  start = 0,
  end = plan.duration
) => [...iterateReviewActionAudioCues(plan, { start, end })].flat();
function admission(plan: ReturnType<typeof buildReviewActionAudioPlan>) {
  const iterator = reviewActionAudioAdmission(plan);
  for (;;) {
    const next = iterator.next();
    if (next.done) return next.value;
  }
}

it('projects only retained markers, uses result offsets and preserves native waveform tempo across Speed', () => {
  const segments = buildReviewTimeMap(12, [
    { id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
    {
      id: 'speed',
      kind: 'speed',
      start: 6,
      end: 8,
      requestedStart: 6,
      requestedEnd: 8,
      rate: 2,
      audio: 'speed',
    },
  ]);
  const removed = marker('removed', 3),
    retained = marker('retained', 7);
  const plan = buildReviewActionAudioPlan({
    markers: [removed, retained],
    settings: [
      settings(removed, 'mouse-classic-v1', 2),
      settings(retained, 'mouse-classic-v1', 0.2),
    ],
    segments,
    applied: true,
  });
  const cues = collect(plan);
  expect(cues).toHaveLength(1);
  expect(cues[0]).toMatchObject({ ref: retained.ref, start: 4.7, sourceOffset: 0, rate: 1 });
  expect(cues[0]!.end - cues[0]!.start).toBeCloseTo(7995 / 44100, 12);
  expect(
    collect(
      buildReviewActionAudioPlan({
        markers: [retained],
        settings: [settings(retained)],
        segments,
        applied: false,
      })
    )
  ).toEqual([]);
});

it('crops cut/main boundaries with source offsets and bounded fades without moving a negative-offset attack', () => {
  const segments = buildReviewTimeMap(4, [
    { id: 'cut', kind: 'cut', start: 2, end: 3, requestedStart: 2, requestedEnd: 3 },
  ]);
  const head = marker('head', 0),
    tail = marker('tail', 1.95);
  const cues = collect(
    buildReviewActionAudioPlan({
      markers: [head, tail],
      settings: [settings(head, 'mouse-classic-v1', -0.05), settings(tail)],
      segments,
      applied: true,
    })
  );
  expect(cues[0]).toMatchObject({ start: 0, sourceOffset: 0.05, fadeIn: 0.01 });
  expect(cues[1]!.end).toBe(2);
  expect(cues[1]!.fadeOut).toBeLessThanOrEqual(Math.min(0.01, (cues[1]!.end - cues[1]!.start) / 4));
});

it('uses accepted two/three-key phases for proven chords and a one-key fallback for a single key', () => {
  for (const [count, offsets] of [
    [2, [0, 0.22]],
    [3, [0, 0.09, 0.29]],
    [5, [0, 0.09, 0.29]],
    [1, [0]],
  ] as const) {
    const key = marker('keys', 1, 'keyboard', 1.55, count);
    const cues = collect(
      buildReviewActionAudioPlan({
        markers: [key],
        settings: [settings(key, 'keyboard-v1')],
        segments: buildReviewTimeMap(4, []),
        applied: true,
      })
    );
    expect(cues.map((cue) => cue.start - 1)).toEqual(offsets.map((value) => 1 + value - 1));
    expect(cues.every((cue) => cue.rate === 1)).toBe(true);
    if (count >= 3)
      expect(cues.map((cue) => cue.sampleId)).toEqual([
        'chord-2-down-v1',
        'chord-3-third-v1',
        'chord-2-up-v1',
      ]);
  }
});

it('keeps typing compact, splits cuts and preserves phase across speed seams and query partitions', () => {
  const typing = marker('typing', 1, 'typing', 10);
  const segments = buildReviewTimeMap(12, [
    { id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
    {
      id: 'speed',
      kind: 'speed',
      start: 6,
      end: 8,
      requestedStart: 6,
      requestedEnd: 8,
      rate: 2,
      audio: 'speed',
    },
  ]);
  const plan = buildReviewActionAudioPlan({
    markers: [typing],
    settings: [settings(typing, 'typing-natural-v1')],
    segments,
    applied: true,
  });
  expect(plan.descriptors).toHaveLength(2);
  const whole = collect(plan);
  const parts = [
    ...collect(plan, 0, 2),
    ...collect(plan, 2, 5),
    ...collect(plan, 5, plan.duration),
  ];
  expect([...new Map(parts.map((cue) => [cue.id, cue])).values()]).toEqual(whole);
  expect(new Set(whole.map((cue) => cue.id)).size).toBe(whole.length);
  expect(whole.every((cue) => cue.end <= 7 && cue.rate === 1)).toBe(true);
  expect(admission(plan).maxVoices).toBeLessThanOrEqual(2);
});

it('admits exact full-axis overlap independently of query order and never truncates 256-cue batches', () => {
  const markers = Array.from({ length: 600 }, (_, index) =>
    marker(String(index), index * 0.004, 'keyboard')
  );
  const plan = buildReviewActionAudioPlan({
    markers,
    settings: markers.map((entry) => settings(entry, 'keyboard-v1')),
    segments: buildReviewTimeMap(4, []),
    applied: true,
  });
  const batches = [...iterateReviewActionAudioCues(plan, { start: 0, end: 4 })];
  expect(batches.every((batch) => batch.length <= 256)).toBe(true);
  expect(batches.flat()).toHaveLength(600);
  const slices = [...collect(plan, 0, 1), ...collect(plan, 1, 2)];
  expect([...new Map(slices.map((cue) => [cue.id, cue])).values()]).toEqual(collect(plan, 0, 2));
  expect(admission(plan).maxVoices).toBeLessThanOrEqual(64);
  for (const count of [64, 65]) {
    const group = Array.from({ length: count }, (_, index) => marker(String(index), 1));
    const crowded = buildReviewActionAudioPlan({
      markers: group,
      settings: group.map((entry) => settings(entry)),
      segments: buildReviewTimeMap(4, []),
      applied: true,
    });
    if (count === 64) expect(admission(crowded)).toMatchObject({ maxVoices: 64, busGain: 1 / 64 });
    else expect(() => admission(crowded)).toThrow('voice-limit');
  }
});
