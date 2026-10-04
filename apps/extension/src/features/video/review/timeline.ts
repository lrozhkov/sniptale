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

/** Copy needs verified boundaries only where authored edits change visible source material. */
export function reviewVisibleEditBoundaries(edits: readonly ReviewEdit[]): number[] {
  const cuts = edits.filter((edit) => edit.kind === 'cut');
  return edits.flatMap((edit) =>
    [edit.start, edit.end].filter(
      (time) => edit.kind === 'cut' || !cuts.some((cut) => cut.start < time && time < cut.end)
    )
  );
}

/** Edits on one lane cannot overlap each other; cuts and speed retain independent lanes. */
function validateReviewEditIntervals(duration: number, edits: readonly ReviewEdit[]): void {
  for (const kind of ['cut', 'speed'] as const) {
    let previousEnd = 0;
    for (const edit of edits
      .filter((item) => item.kind === kind)
      .sort((a, b) => a.start - b.start)) {
      if (
        !Number.isFinite(edit.start) ||
        !Number.isFinite(edit.end) ||
        edit.start < previousEnd ||
        edit.start < 0 ||
        edit.start >= edit.end ||
        edit.end > duration
      )
        throw new Error('Review edit interval is invalid.');
      previousEnd = edit.end;
    }
  }
}

/** A cut has precedence within one disjoint source interval, without changing its speed edit. */
function effectiveReviewInterval(start: number, end: number, edits: readonly ReviewEdit[]) {
  const covering = (kind: ReviewEdit['kind']) =>
    edits.find((edit) => edit.kind === kind && edit.start <= start && edit.end >= end);
  if (covering('cut')) return { kind: 'cut' as const, rate: 1 };
  const speed = covering('speed');
  return speed?.kind === 'speed'
    ? { kind: 'speed' as const, rate: speed.rate }
    : { kind: 'keep' as const, rate: 1 };
}

/** Single source-time lane; removed spans retain their source width and have zero result duration. */
export function buildReviewTimeMap(
  duration: number,
  edits: readonly ReviewEdit[]
): ReviewTimeSegment[] {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Review duration is invalid.');
  validateReviewEditIntervals(duration, edits);
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
  const boundaries = [
    ...new Set([0, duration, ...edits.flatMap((edit) => [edit.start, edit.end])]),
  ].sort((a, b) => a - b);
  for (let index = 1; index < boundaries.length; index += 1) {
    const start = boundaries[index - 1]!;
    const end = boundaries[index]!;
    const interval = effectiveReviewInterval(start, end, edits);
    append(end, interval.kind, interval.rate);
  }
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
