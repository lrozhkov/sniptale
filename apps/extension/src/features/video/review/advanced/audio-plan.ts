import type { QuickEditAudioClip } from './types';
import type { ActionSoundSampleId } from '../action-audio-catalog';
import { iterateReviewActionAudioCues, type ReviewActionAudioPlan } from '../action-audio';

/** Project bytes and immutable bundled samples have separate resolution authorities. */
type QuickEditAudioSource =
  | { kind: 'project'; assetId: string }
  | { kind: 'bundled'; sampleId: ActionSoundSampleId };

/** Namespaces decoder/cache identities without manufacturing project asset IDs. */
export function quickEditAudioSourceKey(source: QuickEditAudioSource): string {
  return JSON.stringify([
    source.kind,
    source.kind === 'project' ? source.assetId : source.sampleId,
  ]);
}

/** Compact full-main plan plus a single main-to-fragment offset; bounds are global, never query-local. */
export interface QuickEditActionAudioSchedule {
  plan: ReviewActionAudioPlan;
  busGain: number;
  offset: number;
  bounds?: { start: number; end: number };
}

/** One scheduled external-audio entry in output time; consumed by preview and export. */
export interface QuickEditAudioPlanEntry {
  lane: 'voiceover' | 'music' | 'action';
  clipId: string;
  source: QuickEditAudioSource;
  timelineStart: number;
  duration: number;
  sourceOffset: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  playbackRate?: number;
  fadePhase?: { offset: number; duration: number };
}

/**
 * Derives the applied external-audio schedule from effective clips; dormant clips
 * are not applied and muted clips contribute silence.
 */
export function buildQuickEditAudioPlan(args: {
  voiceover: readonly QuickEditAudioClip[];
  music: readonly QuickEditAudioClip[];
}): readonly QuickEditAudioPlanEntry[] {
  return (['voiceover', 'music'] as const).flatMap((lane) =>
    args[lane].map((clip) => ({
      lane,
      clipId: clip.id,
      source: { kind: 'project' as const, assetId: clip.assetId },
      timelineStart: clip.timelineStart,
      duration: clip.duration,
      sourceOffset: clip.sourceOffset,
      volume: clip.muted ? 0 : clip.volume,
      fadeIn: clip.fadeIn,
      fadeOut: clip.fadeOut,
      ...(clip.playbackRate ? { playbackRate: clip.playbackRate } : {}),
      ...(clip.fadePhase ? { fadePhase: clip.fadePhase } : {}),
    }))
  );
}

/** Exhaust every bounded batch; seeking and window partitioning preserve cue identity and phase. */
export function* iterateQuickEditActionAudioPlan(
  action: QuickEditActionAudioSchedule,
  window: { start: number; end: number }
): Generator<readonly QuickEditAudioPlanEntry[], void> {
  const lower = action.bounds?.start ?? 0;
  const upper = action.bounds?.end ?? action.plan.duration;
  const start = Math.max(lower, window.start + action.offset);
  const end = Math.min(upper, window.end + action.offset);
  if (end <= start) return;
  for (const batch of iterateReviewActionAudioCues(action.plan, { start, end })) {
    const entries: QuickEditAudioPlanEntry[] = [];
    for (const cue of batch) {
      const from = Math.max(lower, cue.start),
        to = Math.min(upper, cue.end);
      if (to <= from) continue;
      const duration = to - from;
      const fade = Math.min(0.01, duration / 4);
      entries.push({
        lane: 'action',
        clipId: cue.id,
        source: { kind: 'bundled', sampleId: cue.sampleId },
        timelineStart: from - action.offset,
        duration,
        sourceOffset: cue.sourceOffset + from - cue.start,
        volume: cue.volume * action.busGain,
        fadeIn: from > cue.start ? fade : Math.min(cue.fadeIn, duration / 4),
        fadeOut: to < cue.end ? fade : Math.min(cue.fadeOut, duration / 4),
        playbackRate: 1,
      });
    }
    if (entries.length) yield entries;
  }
}

/** Presence uses the same clipped native cues as scheduling, including pre-window tails. */
export function hasQuickEditActionAudio(
  action: QuickEditActionAudioSchedule,
  window: { start: number; end: number }
): boolean {
  return !iterateQuickEditActionAudioPlan(action, window).next().done;
}

/** Gain automation [second, value] pairs over the clip interval, clipped to [0, duration]. */
type QuickEditAudioEnvelope = readonly (readonly [number, number])[];

/** Clip-local gain envelope; a mid-clip start resumes at the matching gain. */
export function buildQuickEditClipEnvelope(args: {
  entry: Pick<
    QuickEditAudioPlanEntry,
    'volume' | 'fadeIn' | 'fadeOut' | 'playbackRate' | 'fadePhase'
  >;
  duration: number;
  elapsed: number;
}): QuickEditAudioEnvelope {
  const { volume, fadeIn, fadeOut } = args.entry;
  const duration = Math.max(0, args.duration);
  const elapsed = Math.min(Math.max(0, args.elapsed), duration);
  const rate = args.entry.playbackRate ?? 1;
  const phaseOffset = args.entry.fadePhase?.offset ?? 0;
  const phaseDuration = args.entry.fadePhase?.duration ?? duration;
  const gainAt = (time: number) => {
    const phase = phaseOffset + time * rate;
    let gain = volume;
    if (fadeIn > 0 && phase < fadeIn) gain = Math.min(gain, (volume * phase) / fadeIn);
    if (fadeOut > 0 && phaseDuration - phase < fadeOut)
      gain = Math.min(gain, (volume * (phaseDuration - phase)) / fadeOut);
    return Math.max(0, gain);
  };
  const points: [number, number][] = [[elapsed, gainAt(elapsed)]];
  const fadeInEnd = (fadeIn - phaseOffset) / rate;
  if (fadeIn > 0 && fadeInEnd < duration && fadeInEnd > elapsed)
    points.push([fadeInEnd, gainAt(fadeInEnd)]);
  const fadeOutStart = (phaseDuration - fadeOut - phaseOffset) / rate;
  if (fadeOut > 0 && fadeOutStart > elapsed && fadeOutStart > 0 && fadeOutStart < duration)
    points.push([fadeOutStart, gainAt(fadeOutStart)]);
  // The scheduled source stops at the clip end; only an authored fade lowers its gain.
  points.push([duration, gainAt(duration)]);
  return points;
}

export interface QuickEditClipSchedule {
  /** Audio-clock start time; already in the future or now. */
  when: number;
  /** Read position inside the decoded asset. */
  offset: number;
  /** Seconds of asset to play. */
  duration: number;
  playbackRate?: number;
  /** Audio-clock gain automation points. */
  envelope: QuickEditAudioEnvelope;
}

/**
 * Scheduling math for one external clip at the current output time: elapsed
 * output time becomes an asset offset, future starts become lead-in, and ended
 * clips produce nothing.
 */
export function planQuickEditClipPlayback(args: {
  entry: QuickEditAudioPlanEntry;
  outputTime: number;
  audioNow: number;
}): QuickEditClipSchedule | null {
  const elapsed = args.outputTime - args.entry.timelineStart;
  if (args.entry.volume <= 0 || elapsed >= args.entry.duration) return null;
  const remaining = args.entry.duration - Math.max(0, elapsed);
  const when = args.audioNow + Math.max(0, -elapsed);
  const envelope = buildQuickEditClipEnvelope({
    entry: args.entry,
    duration: args.entry.duration,
    elapsed: Math.max(0, elapsed),
  }).map(([local, value]) => [when + (local - Math.max(0, elapsed)), value] as const);
  return {
    when,
    offset: args.entry.sourceOffset + Math.max(0, elapsed) * (args.entry.playbackRate ?? 1),
    duration: remaining * (args.entry.playbackRate ?? 1),
    ...(args.entry.playbackRate ? { playbackRate: args.entry.playbackRate } : {}),
    envelope,
  };
}
