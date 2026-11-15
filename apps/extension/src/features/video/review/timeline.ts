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
  for (const edit of edits) {
    if (edit.kind !== 'freeze') continue;
    if (
      ![edit.start, edit.end, edit.duration, edit.frameTime, edit.frameDuration].every(
        Number.isFinite
      ) ||
      edit.start < 0 ||
      edit.start > duration ||
      edit.end !== edit.start ||
      edit.duration <= 0 ||
      edit.duration > 600 ||
      edit.frameTime < 0 ||
      edit.frameTime >= duration ||
      edit.frameDuration <= 0 ||
      edit.frameDuration > 172800 ||
      (edit.start !== 0 && edit.frameTime > edit.start) ||
      edit.frameTime + edit.frameDuration < edit.start - 1e-6
    )
      throw new Error('Review freeze interval is invalid.');
  }
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
  const holds = (at: number) => {
    if (edits.some((edit) => edit.kind === 'cut' && edit.start <= at && at < edit.end)) return;
    for (const edit of edits
      .filter((edit) => edit.kind === 'freeze' && edit.start === at)
      .sort((a, b) => a.id.localeCompare(b.id))) {
      if (edit.kind !== 'freeze') continue;
      segments.push({
        sourceStart: at,
        sourceEnd: at,
        resultStart: resultEnd,
        resultEnd: resultEnd + edit.duration,
        kind: 'freeze',
        rate: 0,
        freezeId: edit.id,
        frameTime: edit.frameTime,
        frameDuration: edit.frameDuration,
      });
      resultEnd += edit.duration;
    }
  };
  for (let index = 1; index < boundaries.length; index += 1) {
    const start = boundaries[index - 1]!;
    holds(start);
    const end = boundaries[index]!;
    const interval = effectiveReviewInterval(start, end, edits);
    append(end, interval.kind, interval.rate);
  }
  holds(duration);
  return segments;
}

/** Exact physical source sample; inserted project time never advances the held source. */
export function reviewSegmentSourceTime(segment: ReviewTimeSegment, time: number): number {
  return segment.kind === 'freeze'
    ? (segment.frameTime ?? segment.sourceStart)
    : segment.sourceStart + (time - segment.resultStart) * segment.rate;
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
      return reviewSegmentSourceTime(segment, time);
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
    if (segment.kind === 'freeze') {
      if (anchor.start <= segment.sourceStart && segment.sourceStart < anchor.end)
        ranges.push({ start: segment.resultStart, end: segment.resultEnd });
      continue;
    }
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

/** Timeline display retains cut widths and source speed widths, while insertions have their own width. */
export function createReviewDisplayMap(duration: number, edits: readonly ReviewEdit[]) {
  let cursor = 0;
  const parts = buildReviewTimeMap(duration, edits).map((segment) => {
    const start = cursor;
    cursor +=
      segment.kind === 'freeze'
        ? segment.resultEnd - segment.resultStart
        : segment.sourceEnd - segment.sourceStart;
    return { segment, start, end: cursor };
  });
  const findResult = (time: number, edge: 'start' | 'end') =>
    parts.find(
      ({ segment }) =>
        segment.kind !== 'cut' &&
        (edge === 'end'
          ? time > segment.resultStart && time <= segment.resultEnd
          : time >= segment.resultStart && time < segment.resultEnd)
    );
  const sourceToDisplay = (time: number, edge: 'start' | 'end' = 'start') => {
    const part = parts.find(
      ({ segment }) =>
        segment.kind !== 'freeze' &&
        (edge === 'end'
          ? time > segment.sourceStart && time <= segment.sourceEnd
          : time >= segment.sourceStart && time < segment.sourceEnd)
    );
    return part ? part.start + time - part.segment.sourceStart : time <= 0 ? 0 : cursor;
  };
  const displayToSource = (time: number) => {
    const part = parts.find((part) => time >= part.start && time < part.end);
    return part
      ? part.segment.sourceStart + (part.segment.kind === 'freeze' ? 0 : time - part.start)
      : time <= 0
        ? 0
        : duration;
  };
  const resultToDisplay = (time: number, edge: 'start' | 'end' = 'start') => {
    const part = findResult(time, edge);
    return part
      ? part.start +
          (time - part.segment.resultStart) *
            (part.segment.kind === 'freeze' ? 1 : part.segment.rate)
      : time <= 0
        ? 0
        : cursor;
  };
  const displayToResult = (time: number) => {
    const part = parts.find((part) => time >= part.start && time < part.end);
    return part
      ? part.segment.resultStart +
          (part.segment.kind === 'cut'
            ? 0
            : (time - part.start) / (part.segment.kind === 'freeze' ? 1 : part.segment.rate))
      : time <= 0
        ? 0
        : (parts.at(-1)?.segment.resultEnd ?? 0);
  };
  return {
    duration: cursor,
    parts,
    sourceToDisplay,
    displayToSource,
    resultToDisplay,
    displayToResult,
  };
}
