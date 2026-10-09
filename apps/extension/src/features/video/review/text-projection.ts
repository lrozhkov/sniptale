import { mapReviewAnchor } from './timeline';
import type { ReviewTimeSegment } from './time-segment';
import type { ReviewTextFragment } from './text-document';

/** Result-time display slices use the same Cut/Speed conversion authority as comments and playback. */
export function projectReviewTextFragment(
  fragment: ReviewTextFragment,
  segments: readonly ReviewTimeSegment[]
) {
  if (fragment.timeDomain === 'source') {
    const projected = mapReviewAnchor(
      { kind: 'range', start: fragment.start, end: fragment.end },
      segments
    );
    return {
      ...projected,
      partiallyExcluded:
        projected.partiallyExcluded || fragment.end > (segments.at(-1)?.sourceEnd ?? 0),
    };
  }
  const duration = segments.at(-1)?.resultEnd ?? 0;
  const start = Math.min(fragment.start, duration);
  const end = Math.min(fragment.end, duration);
  return {
    excludedFromResult: end <= start,
    partiallyExcluded: fragment.end > duration,
    ranges: end > start ? [{ start, end }] : [],
  };
}

/** Interval packing has no fixed row cap; callers supply one common timeline clock and unique IDs. */
export function packReviewTextRows(
  intervals: readonly { id: string; start: number; end: number }[]
): Map<string, number> {
  const rows = new Map<string, number>();
  const ends: number[] = [];
  for (const interval of [...intervals].sort(
    (a, b) => a.start - b.start || a.id.localeCompare(b.id)
  )) {
    let row = ends.findIndex((end) => end <= interval.start);
    if (row < 0) row = ends.length;
    ends[row] = interval.end;
    rows.set(interval.id, row);
  }
  return rows;
}
