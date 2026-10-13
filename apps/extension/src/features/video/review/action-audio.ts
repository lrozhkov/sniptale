import { isReviewKey } from './key-animation';
import { iterateRecordingKeyboardRhythm } from '../project/keyboard-rhythm';
import type { RecordingKeyboardRhythmBlock } from '../project/types/interaction';
import { ACTION_SOUND_CATALOG, type ActionSoundSampleId } from './action-audio-catalog';
import { actionAudioSeed, iterateActionTypingWindow } from './action-audio-generator';
import {
  reviewActionAudioPresetFamily,
  reviewActionAudioRefKey,
  type ReviewActionAudioRef,
  type ReviewActionAudioSetting,
  type ReviewActionAudioTarget,
} from './advanced/action-audio';
import type { ReviewTelemetryMarker } from './telemetry';
import type { ReviewTimeSegment } from './timeline';

const KEY_SAMPLES = ['key-01-v1', 'key-02-v1', 'key-03-v1', 'key-04-v1'] as const;
const MAX_VOICES = 64;
const MAX_BATCH = 256;
type Bounds = { start: number; end: number };
type DescriptorBase = {
  ref: ReviewActionAudioRef;
  id: string;
  phaseStart: number;
  bounds: Bounds;
  volume: number;
};
type SampleDescriptor = DescriptorBase & { kind: 'sample'; sampleId: ActionSoundSampleId };
type TypingDescriptor = DescriptorBase & { kind: 'typing'; seed: number };
type RecordedDescriptor = DescriptorBase & {
  kind: 'recorded';
  block: RecordingKeyboardRhythmBlock;
  run: KeptRun;
  offset: number;
  queryBounds: Bounds;
};
type Descriptor = SampleDescriptor | TypingDescriptor | RecordedDescriptor;

/** Compact main-time descriptions; generator state and PCM never enter saved workspace content. */
export interface ReviewActionAudioPlan {
  duration: number;
  descriptors: readonly Descriptor[];
}
/** Native sample proposal: global clipping changes offsets/envelopes, never waveform tempo. */
interface ReviewActionAudioCue {
  id: string;
  ref: ReviewActionAudioRef;
  sampleId: ActionSoundSampleId;
  start: number;
  end: number;
  sourceOffset: number;
  rate: 1;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

export class ReviewActionAudioUnavailable extends Error {
  constructor(
    readonly reason: 'voice-limit' | 'resource-missing' | 'resource-invalid',
    options?: ErrorOptions
  ) {
    super(`Action audio unavailable: ${reason}`, options);
    this.name = 'ReviewActionAudioUnavailable';
  }
}

/** Audio eligibility includes point-free clicks and normalized typing, independently of visual effects. */
export function reviewActionAudioTarget(
  marker: ReviewTelemetryMarker
): ReviewActionAudioTarget | null {
  if (marker.ref.kind === 'cursor' || marker.privacy === 'protected' || marker.keyboardHold)
    return null;
  const family =
    marker.ref.kind === 'action'
      ? marker.audio?.family === 'mouse' ||
        marker.gesture ||
        marker.eventType === 'CLICK' ||
        marker.eventType === 'DOUBLE_CLICK'
        ? 'mouse'
        : isReviewKey(marker)
          ? 'keyboard'
          : null
      : marker.eventType === 'typing'
        ? 'typing'
        : null;
  return family
    ? {
        ref: { kind: marker.ref.kind, id: marker.ref.id },
        family,
        ...(marker.observed || marker.gesture || marker.keyboardAttack || marker.keyboardRhythm
          ? { recorded: true }
          : {}),
      }
    : null;
}

type KeptRun = {
  parts: readonly ReviewTimeSegment[];
  sourceStart: number;
  sourceEnd: number;
} & Bounds;
function keptRuns(segments: readonly ReviewTimeSegment[]): KeptRun[] {
  const runs: KeptRun[] = [];
  let parts: ReviewTimeSegment[] = [];
  const finish = () => {
    if (parts.length)
      runs.push({
        parts,
        sourceStart: parts[0]!.sourceStart,
        sourceEnd: parts.at(-1)!.sourceEnd,
        start: parts[0]!.resultStart,
        end: parts.at(-1)!.resultEnd,
      });
    parts = [];
  };
  for (const part of segments) {
    if (part.kind === 'cut') finish();
    else parts.push(part);
  }
  finish();
  return runs;
}
function resultTime(run: KeptRun, source: number) {
  const part =
    run.parts.find((part) => source >= part.sourceStart && source < part.sourceEnd) ??
    (source === run.sourceEnd ? run.parts.at(-1) : undefined);
  if (!part) throw new Error('Action audio source time is invalid.');
  return part.resultStart + (source - part.sourceStart) / part.rate;
}

function samplePhases(setting: ReviewActionAudioSetting, marker: ReviewTelemetryMarker) {
  if (setting.presetId === 'mouse-classic-v1')
    return [{ sampleId: 'mouse-click-v1' as const, at: 0, gain: 1 }];
  if (setting.presetId === 'mouse-alternate-v1')
    return [{ sampleId: 'mouse-click-02-v1' as const, at: 0, gain: 1 }];
  if (setting.presetId === 'mouse-soft-v1')
    return [{ sampleId: 'mouse-click-03-v1' as const, at: 0, gain: 1 }];
  const count = marker.audio?.family === 'keyboard' ? marker.audio.keyCount : 1;
  if (count === 2)
    return [
      { sampleId: 'chord-2-down-v1' as const, at: 0, gain: 1 },
      { sampleId: 'chord-2-up-v1' as const, at: 0.22, gain: 1 },
    ];
  if (count >= 3)
    return [
      { sampleId: 'chord-2-down-v1' as const, at: 0, gain: 1 },
      { sampleId: 'chord-3-third-v1' as const, at: 0.09, gain: 1 },
      { sampleId: 'chord-2-up-v1' as const, at: 0.29, gain: 1.125011444557477 },
    ];
  // Larger proven chords use the bounded three-key illustration, never invented capture timing.
  const sampleId =
    KEY_SAMPLES[actionAudioSeed(setting.ref, 'keyboard-v1', 'single') % KEY_SAMPLES.length]!;
  return [{ sampleId, at: 0, gain: 1 }];
}

/** Uses the complete retained source map before any fragment/query offset is applied. */
export function buildReviewActionAudioPlan(args: {
  markers: readonly ReviewTelemetryMarker[];
  settings: readonly ReviewActionAudioSetting[];
  segments: readonly ReviewTimeSegment[];
  applied: boolean;
}): ReviewActionAudioPlan {
  const duration = args.segments.at(-1)?.resultEnd ?? 0;
  const descriptors: Descriptor[] = [];
  if (!args.applied) return { duration, descriptors };
  const settings = new Map(
    args.settings.map((setting) => [reviewActionAudioRefKey(setting.ref), setting])
  );
  const runs = keptRuns(args.segments);
  for (const marker of args.markers) {
    const target = reviewActionAudioTarget(marker);
    if (!target) continue;
    const setting = settings.get(reviewActionAudioRefKey(target.ref));
    if (
      !setting?.enabled ||
      !setting.presetId ||
      setting.volume <= 0 ||
      reviewActionAudioPresetFamily(setting.presetId) !== target.family
    )
      continue;
    if (setting.presetId === 'typing-recorded-v2') {
      for (const descriptor of recordedDescriptors(marker, setting, target.ref, runs))
        descriptors.push(descriptor);
    } else if (target.family === 'typing') {
      for (const descriptor of typingDescriptors(marker, setting, target.ref, runs))
        descriptors.push(descriptor);
    } else {
      for (const descriptor of sampleDescriptors(marker, setting, target.ref, runs))
        descriptors.push(descriptor);
      if (setting.presetId === 'keyboard-recorded-v2' && setting.includeRepeats)
        for (const descriptor of recordedDescriptors(marker, setting, target.ref, runs))
          descriptors.push(descriptor);
    }
  }
  return { duration, descriptors };
}

function* typingDescriptors(
  marker: ReviewTelemetryMarker,
  setting: ReviewActionAudioSetting,
  ref: ReviewActionAudioRef,
  runs: readonly KeptRun[]
): Generator<TypingDescriptor> {
  for (const run of runs) {
    const from = Math.max(marker.start, run.sourceStart),
      to = Math.min(marker.end, run.sourceEnd);
    if (to <= from) continue;
    const span = JSON.stringify([from, to]);
    const phaseStart = resultTime(run, from) + setting.offset;
    const end = Math.min(run.end, resultTime(run, to) + setting.offset),
      start = Math.max(run.start, phaseStart);
    if (end <= start) continue;
    yield {
      kind: 'typing',
      ref: { ...ref },
      id: JSON.stringify([ref.kind, ref.id, setting.presetId, span]),
      phaseStart,
      bounds: { start, end },
      volume: setting.volume,
      seed: actionAudioSeed(ref, 'typing-natural-v1', span),
    };
  }
}

function* sampleDescriptors(
  marker: ReviewTelemetryMarker,
  setting: ReviewActionAudioSetting,
  ref: ReviewActionAudioRef,
  runs: readonly KeptRun[]
): Generator<SampleDescriptor> {
  if (
    setting.presetId === 'mouse-classic-paired-v2' ||
    setting.presetId === 'mouse-soft-paired-v2' ||
    setting.presetId === 'keyboard-recorded-v2'
  ) {
    yield* pairedSampleDescriptors(marker, setting, ref, runs);
  } else yield* illustrativeSampleDescriptors(marker, setting, ref, runs);
}

function pairedAudioPhases(
  marker: ReviewTelemetryMarker,
  setting: ReviewActionAudioSetting,
  ref: ReviewActionAudioRef
) {
  const gesture = marker.gesture;
  const soft = setting.presetId === 'mouse-soft-paired-v2';
  const phases: { id: string; time: number; sampleId: ActionSoundSampleId; gain: number }[] = [];
  if (setting.presetId === 'keyboard-recorded-v2') {
    if (marker.keyboardAttack)
      phases.push({
        id: marker.keyboardAttack.id,
        time: marker.keyboardAttack.time,
        sampleId:
          KEY_SAMPLES[
            actionAudioSeed(ref, 'keyboard-recorded-v2', marker.keyboardAttack.id) %
              KEY_SAMPLES.length
          ]!,
        gain: 1,
      });
  } else if (gesture) {
    if (setting.downEnabled !== false)
      phases.push({
        id: `${gesture.id}:down`,
        time: gesture.downTime,
        sampleId: soft ? 'mouse-click-03-v1' : 'mouse-click-v1',
        gain: setting.downGain ?? 1,
      });
    if (gesture.upTime !== undefined && setting.upEnabled !== false)
      phases.push({
        id: `${gesture.id}:up`,
        time: gesture.upTime,
        sampleId: soft ? 'mouse-click-03-v1' : 'mouse-click-v1',
        gain: setting.upGain ?? 1,
      });
  }
  return phases;
}

function* pairedSampleDescriptors(
  marker: ReviewTelemetryMarker,
  setting: ReviewActionAudioSetting,
  ref: ReviewActionAudioRef,
  runs: readonly KeptRun[]
): Generator<SampleDescriptor> {
  const phases = pairedAudioPhases(marker, setting, ref);
  for (const phase of phases) {
    const run = runs.find((part) => phase.time >= part.sourceStart && phase.time < part.sourceEnd);
    if (!run || phase.gain <= 0) continue;
    yield {
      kind: 'sample',
      ref: { ...ref },
      id: JSON.stringify([ref.kind, ref.id, setting.presetId, phase.id]),
      phaseStart: resultTime(run, phase.time) + setting.offset,
      bounds: { start: run.start, end: run.end },
      sampleId: phase.sampleId,
      volume: setting.volume * phase.gain,
    };
  }
}

function* illustrativeSampleDescriptors(
  marker: ReviewTelemetryMarker,
  setting: ReviewActionAudioSetting,
  ref: ReviewActionAudioRef,
  runs: readonly KeptRun[]
): Generator<SampleDescriptor> {
  const run = runs.find((run) => marker.start >= run.sourceStart && marker.start < run.sourceEnd);
  if (!run) return;
  const anchor = resultTime(run, marker.start) + setting.offset;
  for (const [index, phase] of samplePhases(setting, marker).entries()) {
    const phaseStart = anchor + phase.at,
      sample = ACTION_SOUND_CATALOG[phase.sampleId];
    if (
      phaseStart >= run.end ||
      phaseStart + sample.durationFrames / sample.sampleRate <= run.start
    )
      continue;
    yield {
      kind: 'sample',
      ref: { ...ref },
      id: JSON.stringify([ref.kind, ref.id, setting.presetId, index]),
      phaseStart,
      bounds: { start: run.start, end: run.end },
      sampleId: phase.sampleId,
      volume: setting.volume * phase.gain,
    };
  }
}

function* recordedDescriptors(
  marker: ReviewTelemetryMarker,
  setting: ReviewActionAudioSetting,
  ref: ReviewActionAudioRef,
  runs: readonly KeptRun[]
): Generator<RecordedDescriptor> {
  const blocks = [
    ...(marker.keyboardRhythm ?? []),
    ...(setting.includeRepeats ? (marker.keyboardRepeats ?? []) : []),
  ];
  for (const block of blocks) {
    const elapsed =
      block.encoding === 'delta'
        ? block.ticks.reduce((sum, tick) => sum + tick, 0)
        : block.ticks.reduce(
            (sum, tick, index) => (index % 2 === 0 ? sum + tick * block.ticks[index + 1]! : sum),
            0
          );
    const blockEnd = block.startTime + elapsed / 1000;
    for (const run of runs) {
      if (block.startTime >= run.sourceEnd || blockEnd < run.sourceStart) continue;
      const first = resultTime(run, Math.max(run.sourceStart, block.startTime)) + setting.offset;
      const last = resultTime(run, Math.min(run.sourceEnd, blockEnd)) + setting.offset;
      const queryBounds = {
        start: first,
        end:
          last +
          Math.max(...KEY_SAMPLES.map((id) => ACTION_SOUND_CATALOG[id].durationFrames / 44100)),
      };
      yield {
        kind: 'recorded',
        block,
        run,
        queryBounds,
        offset: setting.offset,
        ref: { ...ref },
        id: JSON.stringify([ref.kind, ref.id, setting.presetId, block.id]),
        phaseStart: 0,
        bounds: { start: run.start, end: run.end },
        volume: setting.volume,
      };
    }
  }
}

function clipCue(
  descriptor: DescriptorBase,
  id: string,
  sampleId: ActionSoundSampleId,
  nativeStart: number,
  gain = 1
): ReviewActionAudioCue | null {
  const sample = ACTION_SOUND_CATALOG[sampleId];
  const nativeEnd = nativeStart + sample.durationFrames / sample.sampleRate;
  const start = Math.max(descriptor.bounds.start, nativeStart),
    end = Math.min(descriptor.bounds.end, nativeEnd);
  if (end <= start) return null;
  const fade = Math.min(0.01, (end - start) / 4);
  return {
    id,
    ref: descriptor.ref,
    sampleId,
    start,
    end,
    sourceOffset: start - nativeStart,
    rate: 1,
    volume: descriptor.volume * gain,
    fadeIn: start > nativeStart ? fade : 0,
    fadeOut: end < nativeEnd ? fade : 0,
  };
}
function* descriptorCues(descriptor: Descriptor, window: Bounds): Generator<ReviewActionAudioCue> {
  if (descriptor.bounds.end <= window.start || descriptor.bounds.start >= window.end) return;
  if (descriptor.kind === 'sample') {
    const cue = clipCue(descriptor, descriptor.id, descriptor.sampleId, descriptor.phaseStart);
    if (cue && cue.start < window.end && cue.end > window.start) yield cue;
    return;
  }
  if (descriptor.kind === 'recorded') {
    const run = descriptor.run;
    if (descriptor.queryBounds.end <= window.start || descriptor.queryBounds.start >= window.end)
      return;
    for (const attack of iterateRecordingKeyboardRhythm(
      descriptor.block,
      run.sourceStart,
      run.sourceEnd
    )) {
      if (attack.time >= run.sourceEnd) continue;
      const time = resultTime(run, attack.time) + descriptor.offset;
      if (time >= window.end) break;
      const sampleId =
        KEY_SAMPLES[
          actionAudioSeed(descriptor.ref, 'typing-recorded-v2', attack.id) % KEY_SAMPLES.length
        ]!;
      const cue = clipCue(descriptor, JSON.stringify([descriptor.id, attack.id]), sampleId, time);
      if (cue && cue.start < window.end && cue.end > window.start) yield cue;
    }
    return;
  }
  for (const event of iterateActionTypingWindow(
    descriptor.seed,
    Math.max(descriptor.bounds.start, window.start) - descriptor.phaseStart,
    Math.min(descriptor.bounds.end, window.end) - descriptor.phaseStart
  )) {
    const cue = clipCue(
      descriptor,
      `${descriptor.id}:${event.id}`,
      event.sampleId,
      descriptor.phaseStart + event.startFrame / 44100,
      event.gain
    );
    if (cue && cue.start < window.end && cue.end > window.start) yield cue;
  }
}

function push<T>(heap: T[], value: T, less: (a: T, b: T) => boolean) {
  let index = heap.length;
  heap.push(value);
  while (index > 0) {
    const parent = (index - 1) >>> 1;
    if (!less(value, heap[parent]!)) break;
    heap[index] = heap[parent]!;
    index = parent;
  }
  heap[index] = value;
}
function pop<T>(heap: T[], less: (a: T, b: T) => boolean): T | undefined {
  const first = heap[0],
    last = heap.pop();
  if (heap.length && last !== undefined) {
    let index = 0;
    while (index * 2 + 1 < heap.length) {
      let child = index * 2 + 1;
      if (child + 1 < heap.length && less(heap[child + 1]!, heap[child]!)) child++;
      if (!less(heap[child]!, last)) break;
      heap[index] = heap[child]!;
      index = child;
    }
    heap[index] = last;
  }
  return first;
}
type Stream = { cue: ReviewActionAudioCue; iterator: Generator<ReviewActionAudioCue> };
const earlier = (a: Stream, b: Stream) =>
  a.cue.start < b.cue.start || (a.cue.start === b.cue.start && a.cue.id < b.cue.id);

/** Every batch is exhausted; window partitioning changes neither identity nor admission. */
export function* iterateReviewActionAudioCues(
  plan: ReviewActionAudioPlan,
  window: Bounds
): Generator<readonly ReviewActionAudioCue[]> {
  if (!Number.isFinite(window.start) || !Number.isFinite(window.end))
    throw new Error('Action audio window is invalid.');
  if (window.end <= window.start) return;
  const streams: Stream[] = [];
  for (const descriptor of plan.descriptors) {
    const iterator = descriptorCues(descriptor, window),
      first = iterator.next();
    if (!first.done) push(streams, { cue: first.value, iterator }, earlier);
  }
  let batch: ReviewActionAudioCue[] = [];
  while (streams.length) {
    const stream = pop(streams, earlier)!;
    batch.push(stream.cue);
    const next = stream.iterator.next();
    if (!next.done) push(streams, { cue: next.value, iterator: stream.iterator }, earlier);
    if (batch.length === MAX_BATCH) {
      yield batch;
      batch = [];
    }
  }
  if (batch.length) yield batch;
}

/** Full main-axis admission happens once per immutable plan; workflow owns yielding/cancellation. */
export function* reviewActionAudioAdmission(
  plan: ReviewActionAudioPlan
): Generator<
  void,
  { maxVoices: number; busGain: number; sampleIds: readonly ActionSoundSampleId[] }
> {
  const active: number[] = [],
    samples = new Set<ActionSoundSampleId>();
  const sooner = (a: number, b: number) => a < b;
  let maxVoices = 0;
  for (const batch of iterateReviewActionAudioCues(plan, { start: 0, end: plan.duration })) {
    for (const cue of batch) {
      while (active.length && active[0]! <= cue.start) pop(active, sooner);
      push(active, cue.end, sooner);
      if (active.length > MAX_VOICES) throw new ReviewActionAudioUnavailable('voice-limit');
      maxVoices = Math.max(maxVoices, active.length);
      samples.add(cue.sampleId);
    }
    yield;
  }
  return { maxVoices, busGain: 1 / Math.max(1, maxVoices), sampleIds: [...samples].sort() };
}
