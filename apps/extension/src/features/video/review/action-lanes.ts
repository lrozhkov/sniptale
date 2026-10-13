import type { ReviewTelemetryMarker } from './telemetry';

/** Readable hit target and count floor for both points and overflow groups. */
export const REVIEW_ACTION_MIN_POINT_WIDTH_PX = 32;

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

/** Semantic history rows are permanent; collisions cluster only within their family. */
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
  const lanes = new Map<number, ReviewActionLaneItem>();
  const sorted = [...markers].sort((a, b) => a.start - b.start || a.ref.id.localeCompare(b.ref.id));
  for (const marker of sorted) {
    const natural = (marker.end - marker.start) * (planeWidth / viewport.duration);
    const lane = reviewActionLane(marker);
    if (lane === null) continue;
    const width = Math.min(planeWidth, Math.max(natural, REVIEW_ACTION_MIN_POINT_WIDTH_PX));
    const left = Math.max(
      0,
      Math.min(marker.start * (planeWidth / viewport.duration), planeWidth - width)
    );
    const item: ReviewActionLaneItem = {
      marker,
      members: [marker],
      lane,
      left,
      width,
    };
    const previous = lanes.get(lane);
    if (previous && left + 1e-7 < previous.left + previous.width) {
      previous.members.push(marker);
      previous.width = Math.max(previous.left + previous.width, left + width) - previous.left;
    } else {
      lanes.set(lane, item);
      items.push(item);
    }
  }
  return { items, laneCount: 3 };
}

/** Shared semantic classification for Gallery and standalone history adapters. */
export function reviewActionLane(
  marker: Pick<ReviewTelemetryMarker, 'eventType' | 'ref'>
): 0 | 1 | 2 | null {
  if (marker.eventType === 'static-frame') return null;
  if (
    marker.eventType === 'KEY' ||
    marker.eventType === 'KEY_HOLD' ||
    marker.eventType === 'KEY_MODIFIERS' ||
    marker.eventType === 'typing'
  )
    return 0;
  if (
    marker.ref.kind === 'cursor' ||
    marker.eventType === 'cursor-idle' ||
    marker.eventType === 'cursor-gap'
  )
    return 2;
  return 1;
}
