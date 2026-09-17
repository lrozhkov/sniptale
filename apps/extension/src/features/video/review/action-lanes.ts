import type { ReviewTelemetryMarker } from './telemetry';

/** Visual floor for point events so screen-colliding starts cannot share one lane. */
export const REVIEW_ACTION_MIN_POINT_WIDTH_PX = 14;
/** Rows shown individually; the dense tail collapses into one overflow chip. */
const REVIEW_ACTION_MAX_LANES = 3;
const CURSOR_BUCKET_DENSITY = 120;

interface ReviewActionLaneItem {
  marker: ReviewTelemetryMarker;
  lane: number;
  left: number;
  width: number;
  visible: boolean;
}

interface ReviewActionLaneLayout {
  items: ReviewActionLaneItem[];
  laneCount: number;
  visibleLanes: number;
  collapsed: boolean;
  overflowCount: number;
}

/**
 * Pure lane packing for the action history track. Intervals are measured in screen
 * pixels — point events claim the minimum visual width — and each item takes the first
 * lane without a screen intersection with earlier items. Cursor samples dedupe per
 * bucket exactly like the previous display grouping.
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
    const left = marker.start * (planeWidth / viewport.duration);
    const natural = (marker.end - marker.start) * (planeWidth / viewport.duration);
    if (marker.ref.kind === 'cursor') {
      const bucket = Math.floor(
        (marker.start / viewport.duration) * CURSOR_BUCKET_DENSITY * viewport.zoom
      );
      if (cursorBuckets.has(bucket)) continue;
      cursorBuckets.add(bucket);
    }
    const item: ReviewActionLaneItem = {
      marker,
      lane: 0,
      left,
      width: Math.max(natural, REVIEW_ACTION_MIN_POINT_WIDTH_PX),
      visible: false,
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
  const laneCount = laneRights.length;
  const collapsed = laneCount > REVIEW_ACTION_MAX_LANES;
  for (const item of items) item.visible = item.lane < REVIEW_ACTION_MAX_LANES;
  return {
    items,
    laneCount,
    visibleLanes: Math.min(laneCount, REVIEW_ACTION_MAX_LANES),
    collapsed,
    overflowCount: collapsed ? items.filter((item) => !item.visible).length : 0,
  };
}
