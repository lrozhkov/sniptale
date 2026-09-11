import type { VideoProjectEffectInstance } from './types';

/** Split at a piecewise timeline edit so retained graph time is continuous on each side. */
export function mapScopedEffectIntervals(
  instances: readonly VideoProjectEffectInstance[],
  trackIds: ReadonlySet<string>,
  edit: { start: number; end: number; duration: number }
): VideoProjectEffectInstance[] {
  const span = edit.end - edit.start;
  if (!(span > 0) || edit.duration < 0) return [...instances];
  const delta = edit.duration - span;
  return instances.flatMap((instance) => {
    const target = instance.target;
    if (
      instance.kind !== 'targetEffect' ||
      instance.rangeMode === 'owner' ||
      (target.kind !== 'video-group' && (target.kind !== 'track' || !trackIds.has(target.trackId)))
    )
      return [instance];
    const end = instance.startTime + instance.duration;
    const slices = [
      { start: instance.startTime, end: Math.min(end, edit.start), offset: 0, rate: 1 },
      {
        start: Math.max(instance.startTime, edit.start),
        end: Math.min(end, edit.end),
        offset: 0,
        rate: edit.duration / span,
      },
      { start: Math.max(instance.startTime, edit.end), end, offset: delta, rate: 1 },
    ].filter((slice) => slice.end > slice.start && slice.rate > 0);
    return slices.map((slice, index) => ({
      ...instance,
      id: index === 0 ? instance.id : crypto.randomUUID(),
      startTime:
        slice.rate === 1
          ? slice.start + slice.offset
          : edit.start + (slice.start - edit.start) * slice.rate,
      duration: (slice.end - slice.start) * slice.rate,
      sourceStart:
        (instance.sourceStart ?? 0) + (slice.start - instance.startTime) * instance.playbackRate,
      playbackRate: instance.playbackRate / slice.rate,
    }));
  });
}
