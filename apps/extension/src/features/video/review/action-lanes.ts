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
  const lanes = new Map<string, ReviewActionLaneItem>();
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
    const category = `${lane}:${marker.eventType === 'typing' ? 'coverage' : 'events'}`;
    const previous = lanes.get(category);
    if (previous && left + 1e-7 < previous.left + previous.width) {
      previous.members.push(marker);
      previous.width = Math.max(previous.left + previous.width, left + width) - previous.left;
    } else {
      lanes.set(category, item);
      items.push(item);
    }
  }
  for (const lane of [0, 1, 2]) {
    const events = items.filter((item) => item.lane === lane && item.marker.eventType !== 'typing');
    for (let index = 0; index < events.length; index++) {
      const item = events[index]!;
      if (item.members.length !== 1 || item.marker.start !== item.marker.end) continue;
      const available = (events[index + 1]?.left ?? planeWidth) - item.left - 4;
      item.width = Math.min(120, Math.max(REVIEW_ACTION_MIN_POINT_WIDTH_PX, available));
    }
  }
  return { items: exposeTypingChoices(items), laneCount: 3 };
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

/** Keep short covered typing intervals available through the covering event menu. */
function exposeTypingChoices(items: ReviewActionLaneItem[]) {
  const output = [...items];
  for (const typing of items.filter((item) => item.marker.eventType === 'typing')) {
    const end = typing.left + typing.width;
    const covering = output
      .filter(
        (item) =>
          item.lane === 0 &&
          item.marker.eventType !== 'typing' &&
          item.left < end &&
          item.left + item.width > typing.left
      )
      .sort((a, b) => a.left - b.left);
    let right = typing.left;
    let gap = 0;
    for (const item of covering) {
      gap = Math.max(gap, item.left - right);
      right = Math.max(right, item.left + item.width);
    }
    if (!covering.length || Math.max(gap, end - right) >= Math.min(24, typing.width)) continue;
    const target = covering[0]!;
    target.members.push(...typing.members);
    output.splice(output.indexOf(typing), 1);
    for (const item of covering.slice(1)) {
      target.members.push(...item.members);
      target.width = Math.max(target.left + target.width, item.left + item.width) - target.left;
      output.splice(output.indexOf(item), 1);
    }
  }
  return output;
}
