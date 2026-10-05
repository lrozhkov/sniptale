import type { ReviewTelemetryMarker } from './telemetry';

/** Visual floor for point events; fit-scale collisions reserve separate lanes. */
export const REVIEW_ACTION_MIN_POINT_WIDTH_PX = 14;
const CURSOR_BUCKET_DENSITY = 120;

interface ReviewActionLaneItem {
  marker: ReviewTelemetryMarker;
  lane: number;
  left: number;
  width: number;
}

interface ReviewActionLaneLayout {
  items: ReviewActionLaneItem[];
  laneCount: number;
}

/**
 * Assign lanes at Fit and project their geometry at the requested zoom. Source-time
 * endpoints keep adjacent intervals together without pixel-rounding collisions.
 * The fit-scale point floor and cursor buckets reserve stable rows while zooming;
 * all action/signal markers remain clickable in the bounded scrolling strip.
 */
export function layoutReviewActionLanes(
  markers: readonly ReviewTelemetryMarker[],
  viewport: { duration: number; width: number; zoom: number }
): ReviewActionLaneLayout {
  if (
    !Number.isFinite(viewport.duration) ||
    viewport.duration <= 0 ||
    !Number.isFinite(viewport.width) ||
    viewport.width <= 0 ||
    !Number.isFinite(viewport.zoom) ||
    viewport.zoom <= 0
  )
    throw new Error('Action lane viewport is invalid.');
  const planeWidth = viewport.width * viewport.zoom;
  const items: ReviewActionLaneItem[] = [];
  const laneEnds: number[] = [];
  const minimumSpan = Math.min(
    viewport.duration,
    (REVIEW_ACTION_MIN_POINT_WIDTH_PX * viewport.duration) / viewport.width
  );
  const cursorBuckets = new Set<number>();
  const sorted = [...markers].sort((a, b) => a.start - b.start || a.ref.id.localeCompare(b.ref.id));
  for (const marker of sorted) {
    const natural = (marker.end - marker.start) * (planeWidth / viewport.duration);
    if (marker.ref.kind === 'cursor') {
      const bucket = Math.floor((marker.start / viewport.duration) * CURSOR_BUCKET_DENSITY);
      if (cursorBuckets.has(bucket)) continue;
      cursorBuckets.add(bucket);
    }
    const width = Math.min(planeWidth, Math.max(natural, REVIEW_ACTION_MIN_POINT_WIDTH_PX));
    const left = Math.max(
      0,
      Math.min(marker.start * (planeWidth / viewport.duration), planeWidth - width)
    );
    const item: ReviewActionLaneItem = {
      marker,
      lane: 0,
      left,
      width,
    };
    const fitStart = Math.max(0, Math.min(marker.start, viewport.duration - minimumSpan));
    const fitEnd = Math.min(viewport.duration, Math.max(marker.end, fitStart + minimumSpan));
    let lane = laneEnds.findIndex((end) => fitStart >= end);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(fitEnd);
    } else {
      laneEnds[lane] = fitEnd;
    }
    item.lane = lane;
    items.push(item);
  }
  return { items, laneCount: laneEnds.length };
}
