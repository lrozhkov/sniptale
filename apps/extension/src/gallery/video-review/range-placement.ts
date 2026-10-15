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
