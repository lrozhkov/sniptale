import { nearestReviewBoundary } from './cuts';
import { buildReviewTimeMap } from './timeline';
import type { ReviewAnchor, ReviewEdit } from './types';

/** A temporary export projection. Source coordinates and the durable document stay unchanged. */
export function createReviewFragment(args: {
  selection: ReviewAnchor;
  duration: number;
  boundaries: readonly number[];
  edits: readonly ReviewEdit[];
}): { start: number; end: number; edits: ReviewEdit[] } | null {
  const { selection, duration, boundaries } = args;
  if (
    selection.kind !== 'range' ||
    !boundaries.length ||
    !Number.isFinite(duration) ||
    duration <= 0
  )
    return null;
  if (
    !Number.isFinite(selection.start) ||
    !Number.isFinite(selection.end) ||
    selection.start < 0 ||
    selection.end > duration ||
    selection.start >= selection.end
  )
    return null;
  const start = nearestReviewBoundary(selection.start, boundaries);
  const end = nearestReviewBoundary(selection.end, boundaries);
  if (start < 0 || end > duration || start >= end) return null;
  const edits = args.edits
    .filter((edit) => edit.start < end && edit.end > start)
    .map((edit) => ({ ...edit, start: Math.max(start, edit.start), end: Math.min(end, edit.end) }));
  const ids = new Set(args.edits.map((edit) => edit.id));
  const exclude = (from: number, to: number) => {
    if (from >= to) return;
    let id = 'fragment-boundary';
    while (ids.has(id)) id += '-';
    ids.add(id);
    edits.push({ id, kind: 'cut', start: from, end: to, requestedStart: from, requestedEnd: to });
  };
  exclude(0, start);
  exclude(end, duration);
  edits.sort((left, right) => left.start - right.start);
  if (
    !buildReviewTimeMap(duration, edits).some((segment) => segment.resultEnd > segment.resultStart)
  )
    return null;
  return { start, end, edits };
}
