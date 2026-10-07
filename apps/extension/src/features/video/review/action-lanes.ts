import type { ReviewTelemetryMarker } from './telemetry';

/** Readable hit target and count floor for both points and overflow groups. */
export const REVIEW_ACTION_MIN_POINT_WIDTH_PX = 32;
const CURSOR_BUCKET_DENSITY = 120;

interface ReviewActionLaneItem {
  marker: ReviewTelemetryMarker;
  members: ReviewTelemetryMarker[];
  lane: number;
  left: number;
  width: number;
}

interface ReviewActionLaneLayout {
  items: ReviewActionLaneItem[];
  laneCount: number;
}

/** Pack screen-space targets into at most three rows; the third row groups overflow.
 * Members retain source identity so coarse-scale aggregation never loses actions. */
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
  const lanes: ReviewActionLaneItem[] = [];
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
      members: [marker],
      lane: 0,
      left,
      width,
    };
    let lane = lanes.findIndex((last) => left + 1e-7 >= last.left + last.width);
    if (lane === -1 && lanes.length < 3) lane = lanes.length;
    if (lane === -1) {
      const group = lanes[2]!;
      group.members.push(marker);
      group.width = Math.max(group.left + group.width, left + width) - group.left;
    } else {
      item.lane = lane;
      lanes[lane] = item;
      items.push(item);
    }
  }
  return { items, laneCount: lanes.length };
}
