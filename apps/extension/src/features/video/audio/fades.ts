/** Shared authoring limit. Rendering preserves the phase of existing longer fades. */
export const MAX_AUDIO_FADE_SECONDS = 60;

/** The numeric field accepts long fades while the contextual scrub remains compact. */
export function getAudioFadeLimitSeconds(duration: number): number {
  return Number.isFinite(duration) ? Math.max(0, Math.min(MAX_AUDIO_FADE_SECONDS, duration)) : 0;
}

interface AudioFadePhase {
  duration: number;
  fadeIn: number;
  fadeOut: number;
}

/** Linear fades overlap by their minimum, independently from the manual gain. */
export function getAudioFadeFactor(phase: AudioFadePhase, time: number): number {
  return Math.max(
    0,
    Math.min(
      1,
      phase.fadeIn > 0 ? time / phase.fadeIn : 1,
      phase.fadeOut > 0 ? (phase.duration - time) / phase.fadeOut : 1
    )
  );
}

/** Exact local-time knots, including the crossing of overlapping phase ramps. */
export function buildAudioFadeEnvelope(
  args: AudioFadePhase & {
    intervalDuration: number;
    elapsed: number;
    offset?: number;
    rate?: number;
  }
): readonly (readonly [number, number])[] {
  const duration = Math.max(0, args.intervalDuration);
  const elapsed = Math.max(0, Math.min(duration, args.elapsed));
  const offset = args.offset ?? 0;
  const rate = args.rate ?? 1;
  const points = [elapsed, duration];
  const phases = [];
  if (args.fadeIn > 0) phases.push(args.fadeIn);
  if (args.fadeOut > 0) phases.push(args.duration - args.fadeOut);
  if (args.fadeIn > 0 && args.fadeOut > 0 && args.fadeIn + args.fadeOut > args.duration)
    phases.push((args.duration * args.fadeIn) / (args.fadeIn + args.fadeOut));
  for (const phase of phases) {
    const local = (phase - offset) / rate;
    if (local > elapsed && local < duration) points.push(local);
  }
  return [...new Set(points)]
    .sort((left, right) => left - right)
    .map((time) => [time, getAudioFadeFactor(args, offset + time * rate)] as const);
}
