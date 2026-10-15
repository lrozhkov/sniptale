import { createContext } from 'react';
import { mapReviewAnchor, type ReviewTimeSegment } from '../../features/video/review/timeline';

/** Read-only projection supplied by the editor's existing time-map owner to inspector rows. */
export const ReviewIntervalMap = createContext<readonly ReviewTimeSegment[] | undefined>(undefined);

/** Sum visible slices: endpoint subtraction cannot represent boundaries inside cuts. */
export function reviewIntervalDuration(
  start: number,
  end: number,
  map: readonly ReviewTimeSegment[] | undefined
): number {
  if (!map) return Math.max(0, end - start);
  return mapReviewAnchor({ kind: 'range', start, end }, map).ranges.reduce(
    (total, range) => total + range.end - range.start,
    0
  );
}
