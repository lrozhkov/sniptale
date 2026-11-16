import type { QuickEditOriginalAudioRange } from '../../features/video/review/advanced/types';
import type { ReviewAnchor, ReviewEdit } from '../../features/video/review/types';

type ReviewPlacementIssue = 'cut' | 'occupied' | 'whole-video' | 'invalid-range' | 'limit';

/** Explains rejected insertion without replacing the domain owner's final candidate admission. */
export function reviewRangePlacementIssue(args: {
  range: ReviewAnchor;
  edits: readonly ReviewEdit[];
  available: boolean;
  occupied?: boolean;
  limit?: boolean;
  removesAll?: boolean;
}): ReviewPlacementIssue | null {
  if (args.range.kind !== 'range') return null;
  const { start, end } = args.range;
  if (args.edits.some((edit) => edit.kind === 'cut' && edit.start < end && edit.end > start))
    return 'cut';
  if (args.limit) return 'limit';
  if (args.occupied) return 'occupied';
  if (args.removesAll) return 'whole-video';
  return args.available ? null : 'invalid-range';
}

/** Toolbar and lane cursor explain original-audio insertion using the same occupied ranges. */
export function reviewOriginalAudioPlacementIssue(args: {
  range: ReviewAnchor;
  edits: readonly ReviewEdit[];
  ranges: readonly QuickEditOriginalAudioRange[] | undefined;
  available: boolean;
}): ReviewPlacementIssue | null {
  const { range, ranges } = args;
  return reviewRangePlacementIssue({
    range,
    edits: args.edits,
    available: args.available,
    occupied:
      range.kind === 'range' &&
      !!ranges?.some((item) => item.start < range.end && item.end > range.start),
    limit: (ranges?.length ?? 0) >= 512,
  });
}

/** The playhead owns the start only while it is inside the explicit half-open selection. */
export function reviewInsertionTarget(
  time: number,
  range?: { start: number; end: number } | null
): { start: number; end: number } | null {
  if (!range) return null;
  return {
    start: time >= range.start && time < range.end ? time : range.start,
    end: range.end,
  };
}

/** Source edits share the immediate-insertion convention and reserve their own occupied spans. */
export function reviewEditInsertionRange(
  kind: 'cut' | 'speed',
  time: number,
  duration: number,
  edits: readonly ReviewEdit[],
  range?: { start: number; end: number } | null
) {
  return reviewInsertionRange({
    time,
    duration,
    seconds: 2,
    range,
    occupied: edits.filter((edit) => edit.kind === kind || edit.kind === 'cut'),
  });
}

/** Fixed-length commands use free space at the requested position; explicit ranges never shrink. */
export function reviewInsertionRange(args: {
  time: number;
  duration: number;
  seconds: number;
  range?: { start: number; end: number } | null | undefined;
  occupied?: readonly { start: number; end: number }[] | undefined;
  minimum?: number;
}): Extract<ReviewAnchor, { kind: 'range' }> | null {
  const target = reviewInsertionTarget(args.time, args.range);
  const start = target?.start ?? args.time;
  let end = Math.min(target?.end ?? start + args.seconds, args.duration);
  for (const item of args.occupied ?? []) {
    if (item.start < end && item.end > start) {
      if (target || item.start <= start) return null;
      end = item.start;
    }
  }
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end <= start ||
    // Subtracting absolute timestamps can put an exact minimum just below its threshold.
    end - start + 1e-9 < (args.minimum ?? 0.05)
  )
    return null;
  return { kind: 'range', start, end };
}

/** Source selection is descriptive; inserted frames require their exact result-time interval. */
export function reviewResultInsertionContext(args: {
  time: number;
  resultTime?: number | null | undefined;
  range?:
    | { start: number; end: number; result?: { start: number; end: number } }
    | null
    | undefined;
  projection: import('./track-projection').ReviewTrackProjection;
}) {
  const { projection, range } = args;
  return {
    time: args.resultTime ?? projection.output(args.time),
    duration: projection.resultDuration,
    range: range
      ? (range.result ?? {
          start: projection.output(range.start),
          end: projection.output(range.end),
        })
      : null,
  };
}
