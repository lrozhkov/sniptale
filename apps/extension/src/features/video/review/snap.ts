import type { ReviewEdit } from './types';
import type { QuickEditZoomRegion } from './advanced/types';

/** Magnet reach in plane pixels; the seconds threshold is derived from the plane width. */
export const SNAP_THRESHOLD_PX = 8;

/**
 * Magnet targets for boundary drags: media cut boundaries, every edit edge,
 * neighboring zoom boundaries, and the playhead.
 */
export function getSnapCandidates(source: {
  edits: readonly ReviewEdit[];
  playhead: number;
  boundaries?: readonly number[];
  zoomRegions?: readonly QuickEditZoomRegion[];
}): number[] {
  const values = new Set<number>();
  for (const value of source.boundaries ?? []) values.add(value);
  for (const region of source.zoomRegions ?? []) {
    values.add(region.start);
    values.add(region.end);
  }
  for (const edit of source.edits) {
    values.add(edit.start);
    values.add(edit.end);
  }
  values.add(source.playhead);
  return [...values].sort((a, b) => a - b);
}

/**
 * Magnetic positioning without persistent anchors: the nearest candidate inside the
 * threshold wins and is reported for the vertical guide; otherwise the time passes through.
 */
export function snapTimelineTime(
  time: number,
  candidates: readonly number[],
  thresholdSeconds: number
): { time: number; candidate: number | null } {
  let best: number | null = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate - time);
    if (distance <= thresholdSeconds + 1e-9 && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best === null ? { time, candidate: null } : { time: best, candidate: best };
}
