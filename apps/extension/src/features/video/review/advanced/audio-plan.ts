import type { QuickEditAudioClip } from './types';

/** One scheduled external-audio entry in output time; consumed by preview and export. */
export interface QuickEditAudioPlanEntry {
  lane: 'voiceover' | 'music';
  clipId: string;
  assetId: string;
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
      assetId: clip.assetId,
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
