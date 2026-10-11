import type { ReviewTimeSegment } from '../time-segment';
import type { ReviewAnnotationEffect } from './types';

/** A retained result interval carries its phase in the complete annotation, including fragment export. */
interface ReviewAnnotationEffectSlice {
  sourceStart: number;
  sourceEnd: number;
  start: number;
  end: number;
  offset: number;
}

/** Projects a source interval without changing its authored anchor or restarting animation after cuts. */
export function projectReviewAnnotationEffect(
  annotation: Pick<ReviewAnnotationEffect, 'start' | 'end'>,
  segments: readonly ReviewTimeSegment[]
) {
  const slices: ReviewAnnotationEffectSlice[] = [];
  let duration = 0;
  for (const segment of segments) {
    if (segment.kind === 'cut') continue;
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
  const progress = (slice.offset + globalResultTime - slice.start) / projection.duration;
  return {
    time: progress * documentDuration,
    progress,
    playbackRate: documentDuration / projection.duration,
  };
}
