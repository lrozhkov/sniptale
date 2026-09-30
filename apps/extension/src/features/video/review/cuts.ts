import { isReviewSpeedRate } from './speed';
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

/** A body drag may land only where both safe boundaries retain its source duration. */
export function placeReviewEditMove(args: {
  current: ReviewEdit;
  requestedStart: number;
  boundaries: readonly number[];
  duration: number;
  edits: readonly ReviewEdit[];
}): { start: number; end: number } {
  const original = { start: args.current.start, end: args.current.end };
  if (!Number.isFinite(args.requestedStart) || !args.boundaries.length) return original;
  const start = nearestReviewBoundary(args.requestedStart, args.boundaries);
  const end = start + args.current.end - args.current.start;
  if (
    start < 0 ||
    end > args.duration ||
    !args.boundaries.some((boundary) => Math.abs(boundary - end) < 0.000001) ||
    args.edits.some(
      (edit) =>
        edit.id !== args.current.id &&
        edit.kind === args.current.kind &&
        edit.start < end &&
        edit.end > start
    )
  )
    return original;
  return { start, end };
}

/** Returns a non-overlapping effective cut while preserving the user's requested interval. */
export function createReviewCut(args: {
  id: string;
  selection: ReviewAnchor;
  boundaries: readonly number[];
  snapToKeyframes?: boolean;
  duration: number;
  edits: readonly ReviewEdit[];
}): ReviewEdit | null {
  const range = reviewRange(args, 'cut');
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
  if (!isReviewSpeedRate(args.rate) || (args.audio !== 'speed' && args.audio !== 'mute'))
    return null;
  const range = reviewRange(args, 'speed');
  return range ? { ...range, kind: 'speed', rate: args.rate, audio: args.audio } : null;
}

function reviewRange(args: Parameters<typeof createReviewCut>[0], kind: ReviewEdit['kind']) {
  const { selection, boundaries, duration, edits } = args;
  if (selection.kind !== 'range' || !boundaries.length) return null;
  if (
    !Number.isFinite(selection.start) ||
    !Number.isFinite(selection.end) ||
    selection.start >= selection.end
  )
    return null;
  const start =
    args.snapToKeyframes === false
      ? selection.start
      : nearestReviewBoundary(selection.start, boundaries);
  const end =
    args.snapToKeyframes === false
      ? selection.end
      : nearestReviewBoundary(selection.end, boundaries);
  if (start < 0 || end > duration || start >= end) return null;
  if (edits.some((edit) => edit.kind === kind && edit.start < end && edit.end > start)) return null;
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
