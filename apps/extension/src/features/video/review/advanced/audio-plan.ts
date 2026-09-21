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
    }))
  );
}

/** Gain automation [second, value] pairs over the clip interval, clipped to [0, duration]. */
type QuickEditAudioEnvelope = readonly (readonly [number, number])[];

/** Clip-local gain envelope; a mid-clip start resumes at the matching gain. */
export function buildQuickEditClipEnvelope(args: {
  entry: Pick<QuickEditAudioPlanEntry, 'volume' | 'fadeIn' | 'fadeOut'>;
  duration: number;
  elapsed: number;
}): QuickEditAudioEnvelope {
  const { volume, fadeIn, fadeOut } = args.entry;
  const duration = Math.max(0, args.duration);
  const elapsed = Math.min(Math.max(0, args.elapsed), duration);
  const gainAt = (time: number) => {
    let gain = volume;
    if (fadeIn > 0 && time < fadeIn) gain = Math.min(gain, (volume * time) / fadeIn);
    if (fadeOut > 0 && duration - time < fadeOut)
      gain = Math.min(gain, (volume * (duration - time)) / fadeOut);
    return Math.max(0, gain);
  };
  const points: [number, number][] = [[elapsed, gainAt(elapsed)]];
  if (fadeIn > 0 && fadeIn < duration && fadeIn > elapsed) points.push([fadeIn, gainAt(fadeIn)]);
  const fadeOutStart = duration - fadeOut;
  if (fadeOut > 0 && fadeOutStart > elapsed && fadeOutStart > 0)
    points.push([fadeOutStart, gainAt(fadeOutStart)]);
  points.push([duration, 0]);
  return points;
}

export interface QuickEditClipSchedule {
  /** Audio-clock start time; already in the future or now. */
  when: number;
  /** Read position inside the decoded asset. */
  offset: number;
  /** Seconds of asset to play. */
  duration: number;
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
    offset: args.entry.sourceOffset + Math.max(0, elapsed),
    duration: remaining,
    envelope,
  };
}
