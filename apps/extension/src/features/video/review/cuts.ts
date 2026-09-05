import type { ReviewAnchor, ReviewEdit } from './types';

/** The supplied index, not a nominal GOP interval, owns selectable cut boundaries. */
export function nearestReviewBoundary(time: number, boundaries: readonly number[]): number {
  if (!Number.isFinite(time) || !boundaries.length)
    throw new Error('Safe boundaries are unavailable.');
  let nearest = boundaries[0]!;
  for (const boundary of boundaries) {
    if (Math.abs(boundary - time) < Math.abs(nearest - time)) nearest = boundary;
  }
  return nearest;
}

/** Returns a non-overlapping effective cut while preserving the user's requested interval. */
export function createReviewCut(args: {
  id: string;
  selection: ReviewAnchor;
  boundaries: readonly number[];
  duration: number;
  edits: readonly ReviewEdit[];
}): ReviewEdit | null {
  const { selection, boundaries, duration, edits } = args;
  if (selection.kind !== 'range' || !boundaries.length) return null;
  if (
    !Number.isFinite(selection.start) ||
    !Number.isFinite(selection.end) ||
    selection.start >= selection.end
  )
    return null;
  const start = nearestReviewBoundary(selection.start, boundaries);
  const end = nearestReviewBoundary(selection.end, boundaries);
  if (start < 0 || end > duration || start >= end) return null;
  if (edits.some((edit) => edit.start < end && edit.end > start)) return null;
  const removed = edits.reduce(
    (sum, edit) => sum + (edit.kind === 'cut' ? edit.end - edit.start : 0),
    end - start
  );
  if (removed >= duration - 0.000001) return null;
  return {
    id: args.id,
    kind: 'cut',
    start,
    end,
    requestedStart: selection.start,
    requestedEnd: selection.end,
  };
}

/** Skips adjacent cuts without changing the source-time coordinate system. */
export function reviewPlaybackTime(time: number, edits: readonly ReviewEdit[]): number {
  let next = time;
  for (const edit of [...edits].sort((left, right) => left.start - right.start))
    if (edit.kind === 'cut' && next >= edit.start && next < edit.end) next = edit.end;
  return next;
}
