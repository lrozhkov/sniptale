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
  const range = reviewRange(args);
  if (!range) return null;
  const removed = args.edits.reduce(
    (sum, edit) => sum + (edit.kind === 'cut' ? edit.end - edit.start : 0),
    range.end - range.start
  );
  return removed >= args.duration - 0.000001 ? null : { ...range, kind: 'cut' };
}

/** A speed property uses the same safe source boundaries without removing the full-video range. */
export function createReviewSpeed(
  args: Parameters<typeof createReviewCut>[0] &
    Pick<Extract<ReviewEdit, { kind: 'speed' }>, 'rate' | 'audio'>
): ReviewEdit | null {
  if (![1.25, 1.5, 2, 4].includes(args.rate) || (args.audio !== 'speed' && args.audio !== 'mute'))
    return null;
  const range = reviewRange(args);
  return range ? { ...range, kind: 'speed', rate: args.rate, audio: args.audio } : null;
}

function reviewRange(args: Parameters<typeof createReviewCut>[0]) {
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
  return {
    id: args.id,
    start,
    end,
    requestedStart: selection.start,
    requestedEnd: selection.end,
  };
}

/** Preview reads speed and sound from the same source intervals used by packet export. */
export function reviewPlaybackSettings(time: number, edits: readonly ReviewEdit[]) {
  const next = reviewPlaybackTime(time, edits);
  const speed = edits.find(
    (edit) => edit.kind === 'speed' && next >= edit.start && next < edit.end
  );
  return {
    time: next,
    rate: speed?.kind === 'speed' ? speed.rate : 1,
    muted: speed?.kind === 'speed' && speed.audio === 'mute',
  };
}

/** Skips adjacent cuts without changing the source-time coordinate system. */
export function reviewPlaybackTime(time: number, edits: readonly ReviewEdit[]): number {
  let next = time;
  for (const edit of [...edits].sort((left, right) => left.start - right.start))
    if (edit.kind === 'cut' && next >= edit.start && next < edit.end) next = edit.end;
  return next;
}
