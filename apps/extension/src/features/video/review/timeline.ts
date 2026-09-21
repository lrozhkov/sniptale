import type { ReviewAnchor, ReviewEdit } from './types';
import type { ReviewTimeSegment } from './time-segment';

export type { ReviewTimeSegment } from './time-segment';

/**
 * One conversion authority for playhead, action markers, snapping, preview, and export.
 * `source` coordinates the original media (persisted ReviewEdit boundaries); `timeline`
 * coordinates the resulting sequence after cuts and speed changes. Removed source points
 * convert to null; timeline times resolve through visible segments only.
 */
interface ReviewTimeMap {
  sourceToTimeline(source: number): number | null;
  timelineToSource(time: number): number | null;
  getDuration(): number;
  getSegments(): readonly ReviewTimeSegment[];
}

/** Single source-time lane; removed spans retain their source width and have zero result duration. */
export function buildReviewTimeMap(
  duration: number,
  edits: readonly ReviewEdit[]
): ReviewTimeSegment[] {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Review duration is invalid.');
  const segments: ReviewTimeSegment[] = [];
  let sourceEnd = 0;
  let resultEnd = 0;
  const append = (end: number, kind: ReviewTimeSegment['kind'], rate: number) => {
    if (end <= sourceEnd) return;
    const next = resultEnd + (kind === 'cut' ? 0 : (end - sourceEnd) / rate);
    segments.push({
      sourceStart: sourceEnd,
      sourceEnd: end,
      resultStart: resultEnd,
      resultEnd: next,
      kind,
      rate,
    });
    sourceEnd = end;
    resultEnd = next;
  };
  for (const edit of [...edits].sort((a, b) => a.start - b.start)) {
    if (
      !Number.isFinite(edit.start) ||
      !Number.isFinite(edit.end) ||
      edit.start < sourceEnd ||
      edit.start >= edit.end ||
      edit.end > duration
    )
      throw new Error('Review edit interval is invalid.');
    append(edit.start, 'keep', 1);
    append(edit.end, edit.kind, edit.kind === 'speed' ? edit.rate : 1);
  }
  append(duration, 'keep', 1);
  return segments;
}

/** Wraps the segment builder in the shared conversion API for every timeline-time consumer. */
export function createReviewTimeMap(duration: number, edits: readonly ReviewEdit[]): ReviewTimeMap {
  const segments = buildReviewTimeMap(duration, edits);
  const duration_ = segments.at(-1)?.resultEnd ?? 0;
  return {
    sourceToTimeline: (source) => sourceToReviewResult(source, segments),
    timelineToSource: (time) => {
      const last = segments.at(-1);
      if (last && time === last.resultEnd) return last.sourceEnd;
      const segment = segments.find(
        (part) => part.kind !== 'cut' && time >= part.resultStart && time < part.resultEnd
      );
      if (!segment) return null;
      return segment.sourceStart + (time - segment.resultStart) * segment.rate;
    },
    getDuration: () => duration_,
    getSegments: () => segments,
  };
}

/** A removed source point has no result time; the final source endpoint maps to result duration. */
export function sourceToReviewResult(
  time: number,
  segments: readonly ReviewTimeSegment[]
): number | null {
  const last = segments.at(-1);
  if (last && time === last.sourceEnd) return last.resultEnd;
  const segment = segments.find((part) => time >= part.sourceStart && time < part.sourceEnd);
  return !segment || segment.kind === 'cut'
    ? null
    : segment.resultStart + (time - segment.sourceStart) / segment.rate;
}

/** Keeps every visible part of a range comment when cuts split its resulting interval. */
export function mapReviewAnchor(anchor: ReviewAnchor, segments: readonly ReviewTimeSegment[]) {
  if (anchor.kind === 'point') {
    const time = sourceToReviewResult(anchor.time, segments);
    return {
      excludedFromResult: time === null,
      partiallyExcluded: false,
      ranges: time === null ? [] : [{ start: time, end: time }],
    };
  }
  const ranges = [];
  let removed = false;
  for (const segment of segments) {
    const start = Math.max(anchor.start, segment.sourceStart);
    const end = Math.min(anchor.end, segment.sourceEnd);
    if (end <= start) continue;
    if (segment.kind === 'cut') {
      removed = true;
      continue;
    }
    ranges.push({
      start: segment.resultStart + (start - segment.sourceStart) / segment.rate,
      end: segment.resultStart + (end - segment.sourceStart) / segment.rate,
    });
  }
  return {
    excludedFromResult: ranges.length === 0,
    partiallyExcluded: removed && ranges.length > 0,
    ranges,
  };
}
