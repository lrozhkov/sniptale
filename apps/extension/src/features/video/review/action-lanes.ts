import type { ReviewTelemetryMarker } from './telemetry';

/** Visual floor for point events so screen-colliding starts cannot share one lane. */
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
 * Pure lane packing for the action history track. Intervals are measured in screen
 * pixels — point events claim the minimum visual width — and each item takes the first
 * lane without a screen intersection with earlier items. Cursor samples dedupe per
 * bucket exactly like the previous display grouping. Every packed marker stays
 * clickable; the strip bounds the lane stack height and scrolls the dense tail.
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
  const laneRights: number[] = [];
  const cursorBuckets = new Set<number>();
  const sorted = [...markers].sort((a, b) => a.start - b.start || a.ref.id.localeCompare(b.ref.id));
  for (const marker of sorted) {
    const natural = (marker.end - marker.start) * (planeWidth / viewport.duration);
    if (marker.ref.kind === 'cursor') {
      const bucket = Math.floor(
        (marker.start / viewport.duration) * CURSOR_BUCKET_DENSITY * viewport.zoom
      );
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
    let lane = laneRights.findIndex((right) => left >= right);
    if (lane === -1) {
      lane = laneRights.length;
      laneRights.push(left + item.width);
    } else {
      laneRights[lane] = left + item.width;
    }
    item.lane = lane;
    items.push(item);
  }
  return { items, laneCount: laneRights.length };
}
