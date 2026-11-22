import { projectReviewVisualAnchor } from '../visual-anchor';
import type { ReviewTimeSegment } from '../time-segment';
import type { ReviewAnnotationEffect } from './types';

/** A retained result interval carries its phase in the complete annotation, including fragment export. */
interface ReviewAnnotationEffectSlice {
  sourceStart: number;
  sourceEnd: number;
  start: number;
  end: number;
  offset: number;
  rate?: number;
}

/** Projects a source interval without changing its authored anchor or restarting animation after cuts. */
export function projectReviewAnnotationEffect(
  annotation: Pick<ReviewAnnotationEffect, 'start' | 'end' | 'timeDomain' | 'visualAnchor'>,
  segments: readonly ReviewTimeSegment[]
) {
  if (annotation.visualAnchor)
    return {
      slices: projectReviewVisualAnchor(annotation.visualAnchor, segments),
      duration: annotation.end - annotation.start,
    };
  if (annotation.timeDomain === 'result')
    return {
      slices: [
        { sourceStart: 0, sourceEnd: 0, start: annotation.start, end: annotation.end, offset: 0 },
      ],
      duration: annotation.end - annotation.start,
    };
  const slices: ReviewAnnotationEffectSlice[] = [];
  let duration = 0;
  for (const segment of segments) {
    if (segment.kind === 'cut') continue;
    if (segment.kind === 'freeze') {
      const source = segment.sourceStart;
      if (annotation.start <= source && source < annotation.end) {
        slices.push({
          sourceStart: source,
          sourceEnd: source,
          start: segment.resultStart,
          end: segment.resultEnd,
          offset: duration,
        });
        duration += segment.resultEnd - segment.resultStart;
      }
      continue;
    }
    const sourceStart = Math.max(annotation.start, segment.sourceStart);
    const sourceEnd = Math.min(annotation.end, segment.sourceEnd);
    if (sourceEnd <= sourceStart) continue;
    const start = segment.resultStart + (sourceStart - segment.sourceStart) / segment.rate;
    const end = segment.resultStart + (sourceEnd - segment.sourceStart) / segment.rate;
    slices.push({ sourceStart, sourceEnd, start, end, offset: duration });
    duration += end - start;
  }
  return { slices, duration };
}

/** Samples the full main-video clock; callers shift/filter fragments only after this calculation. */
export function sampleReviewAnnotationEffect(
  projection: ReturnType<typeof projectReviewAnnotationEffect>,
  documentDuration: number,
  globalResultTime: number
): { time: number; progress: number; playbackRate: number } | null {
  if (!(documentDuration > 0) || !Number.isFinite(documentDuration))
    throw new Error('Invalid annotation document duration.');
  if (projection.duration <= 0) return null;
  const slice = projection.slices.find(
    (part) => globalResultTime >= part.start && globalResultTime < part.end
  );
  if (!slice) return null;
  const rate = slice.rate ?? 1;
  const progress = (slice.offset + (globalResultTime - slice.start) * rate) / projection.duration;
  return {
    time: progress * documentDuration,
    progress,
    playbackRate: (rate * documentDuration) / projection.duration,
  };
}

/** Select one future result slice without evaluating a graph or reading media. */
export function resolveUpcomingReviewAnnotationEffectSlice<
  T extends Pick<
    ReviewAnnotationEffect,
    'id' | 'enabled' | 'order' | 'start' | 'end' | 'timeDomain' | 'visualAnchor'
  >,
>(
  instances: readonly T[],
  segments: readonly ReviewTimeSegment[],
  resultTime: number,
  lookaheadSeconds = 1
): { instance: T; start: number; end: number } | null {
  if (
    !Number.isFinite(resultTime) ||
    !Number.isFinite(lookaheadSeconds) ||
    lookaheadSeconds <= 0 ||
    lookaheadSeconds > 2
  )
    return null;
  const candidates = instances
    .filter((instance) => instance.enabled)
    .flatMap((instance) =>
      projectReviewAnnotationEffect(instance, segments)
        .slices.filter(
          (slice) => slice.start > resultTime && slice.start <= resultTime + lookaheadSeconds
        )
        .map(({ start, end }) => ({ instance, start, end }))
    );
  candidates.sort(
    (a, b) =>
      a.start - b.start ||
      a.instance.order - b.instance.order ||
      a.instance.id.localeCompare(b.instance.id)
  );
  return candidates[0] ?? null;
}
