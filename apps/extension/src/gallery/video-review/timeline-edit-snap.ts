import type { ReviewEdit } from '../../features/video/review/types';
import { placeReviewEditMove } from '../../features/video/review/cuts';
import {
  SNAP_THRESHOLD_PX,
  getSnapCandidates,
  snapTimelineTime,
} from '../../features/video/review/snap';

/** Trim snaps only the dragged edge; a whole-block move keeps both edges magnetic. */
export function snapReviewEditDrag(args: {
  edge: 'start' | 'end' | 'move';
  deltaPx: number;
  duration: number;
  widthPx: number;
  bypass: boolean;
  edits: readonly ReviewEdit[] | undefined;
  boundaries: readonly number[] | undefined;
  playhead: number;
  current: ReviewEdit;
  keyframeMove: boolean;
}): { start: number; end: number; guide: number | null } {
  const free = freeReviewEditDragRange(args);
  if (args.edge === 'move' && args.keyframeMove) {
    const placed = placeReviewEditMove({
      current: args.current,
      requestedStart: free.start,
      boundaries: args.boundaries ?? [],
      duration: args.duration,
      edits: args.edits ?? [],
    });
    return {
      ...placed,
      guide: placed.start === args.current.start ? null : placed.start,
    };
  }
  if (args.bypass || !args.edits || args.widthPx <= 0) return { ...free, guide: null };
  const threshold = (SNAP_THRESHOLD_PX * args.duration) / args.widthPx;
  const candidates = getSnapCandidates({
    edits: args.edits,
    playhead: args.playhead,
    ...(args.boundaries ? { boundaries: args.boundaries } : {}),
  });
  let guide: number | null = null;
  let { start, end } = free;
  if (args.edge === 'move')
    return snapReviewEditMove(start, end, args.duration, candidates, threshold);
  if (args.edge !== 'end') {
    const snap = snapTimelineTime(start, candidates, threshold);
    start = snap.time;
    guide = snap.candidate;
  }
  if (args.edge !== 'start') {
    const snap = snapTimelineTime(end, candidates, threshold);
    end = snap.time;
    guide = snap.candidate ?? guide;
  }
  return { start, end, guide };
}

/** Pointer travel and edge identity determine the unsnapped source interval. */
function freeReviewEditDragRange(args: {
  edge: 'start' | 'end' | 'move';
  current: ReviewEdit;
  deltaPx: number;
  widthPx: number;
  duration: number;
}): { start: number; end: number } {
  const { current, edge, duration } = args;
  const delta = (args.deltaPx / args.widthPx) * duration;
  const length = current.end - current.start;
  if (edge === 'end')
    return { start: current.start, end: Math.max(0, Math.min(duration, current.end + delta)) };
  const start = Math.max(
    0,
    Math.min(duration - (edge === 'move' ? length : 0), current.start + delta)
  );
  return { start, end: edge === 'move' ? start + length : current.end };
}

/** Selects one magnet for a free whole-block move; handles may still snap separately. */
function snapReviewEditMove(
  start: number,
  end: number,
  duration: number,
  candidates: readonly number[],
  threshold: number
): { start: number; end: number; guide: number | null } {
  const length = end - start;
  const startSnap = snapTimelineTime(
    start,
    candidates.filter((candidate) => candidate >= 0 && candidate <= duration - length),
    threshold
  );
  const endSnap = snapTimelineTime(
    end,
    candidates.filter((candidate) => candidate >= length && candidate <= duration),
    threshold
  );
  const startDistance =
    startSnap.candidate === null ? Infinity : Math.abs(startSnap.candidate - start);
  const endDistance = endSnap.candidate === null ? Infinity : Math.abs(endSnap.candidate - end);
  if (startDistance === Infinity && endDistance === Infinity) return { start, end, guide: null };
  const selected = startDistance <= endDistance ? startSnap : endSnap;
  const movedStart = startDistance <= endDistance ? selected.time : selected.time - length;
  return { start: movedStart, end: movedStart + length, guide: selected.candidate };
}
