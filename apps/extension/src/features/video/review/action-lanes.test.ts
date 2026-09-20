import { expect, it } from 'vitest';
import { layoutReviewActionLanes, REVIEW_ACTION_MIN_POINT_WIDTH_PX } from './action-lanes';
import type { ReviewTelemetryMarker } from './telemetry';

const viewport = { duration: 10, width: 100, zoom: 1 };
const marker = (
  id: string,
  start: number,
  end = start,
  kind: ReviewTelemetryMarker['ref']['kind'] = 'action'
): ReviewTelemetryMarker => ({
  ref: { kind, id },
  eventType: 'CLICK',
  start,
  end,
});

it('places colliding point events into separate lanes by screen width, not source time', () => {
  const layout = layoutReviewActionLanes(
    [marker('a', 1), marker('b', 1.01), marker('c', 1.03), marker('d', 1.05)],
    viewport
  );
  expect(layout.items.map((item) => item.lane)).toEqual([0, 1, 2, 3]);
  expect(layout.laneCount).toBe(4);
  expect(layout.items.every((item) => item.left >= 0)).toBe(true);
  // Screen coordinates: 0.01s of source spans less than the point-event floor.
  expect(layout.items[0]!.width).toBe(REVIEW_ACTION_MIN_POINT_WIDTH_PX);
});

it('packs long intervals forward and splits at point-event floors', () => {
  const layout = layoutReviewActionLanes(
    [marker('a', 0, 2), marker('b', 2.5, 3), marker('c', 3, 5)],
    viewport
  );
  // c starts at 30px while the point floor of b still occupies lane 0 until 39px.
  expect(layout.items.map((item) => item.lane)).toEqual([0, 0, 1]);
  expect(layout.laneCount).toBe(2);
});

it('reuses a lane once the previous visual rect ends, measuring in pixels', () => {
  // 10s plane over 100px: 1s = 10px, so point-event floors keep 0.01s events apart.
  const layout = layoutReviewActionLanes(
    [marker('a', 0, 1.2), marker('b', 1.2, 1.21), marker('c', 1.3)],
    viewport
  );
  expect(layout.items.map((item) => item.lane)).toEqual([0, 1, 2]);
});

it('deduplicates cursor samples per display bucket while keeping actions', () => {
  const layout = layoutReviewActionLanes(
    [
      marker('c1', 0.1, 0.1, 'cursor'),
      marker('c2', 0.12, 0.12, 'cursor'),
      marker('c2', 0.3, 0.3, 'cursor'),
      marker('a1', 0.11),
    ],
    viewport
  );
  expect(layout.items).toHaveLength(3);
  expect(layout.items.filter((item) => item.marker.ref.kind === 'cursor')).toHaveLength(2);
});

it('repacks lanes when the timeline zoom changes', () => {
  const markers = [marker('a', 1), marker('b', 1.05)];
  expect(layoutReviewActionLanes(markers, viewport).items.map((item) => item.lane)).toEqual([0, 1]);
  // 8x zoom keeps the 0.05s gap under the point-event floor: still two lanes.
  const zoomed = layoutReviewActionLanes(markers, { ...viewport, zoom: 8 });
  expect(zoomed.items.map((item) => item.lane)).toEqual([0, 1]);
  // 40x zoom separates the events by real pixels: the first free lane wins again.
  const wide = layoutReviewActionLanes(markers, { duration: 10, width: 100, zoom: 40 });
  expect(wide.items.map((item) => item.lane)).toEqual([0, 0]);
});

it('rejects an invalid viewport instead of manufacturing a layout', () => {
  expect(() => layoutReviewActionLanes([], { duration: 0, width: 100, zoom: 1 })).toThrow();
  expect(layoutReviewActionLanes([], viewport)).toEqual({ items: [], laneCount: 0 });
});

it('keeps every dense marker in the layout; no packed item is hidden', () => {
  const markers = Array.from({ length: 12 }, (_, index) => marker(`e${index}`, 1 + index / 200));
  const layout = layoutReviewActionLanes(markers, viewport);
  expect(layout.items).toHaveLength(12);
  expect(layout.items.map((item) => item.marker.ref.id)).toEqual(
    markers.map((entry) => entry.ref.id)
  );
});

it('keeps end-of-recording markers inside the scroll strip without a second horizontal axis', () => {
  const layout = layoutReviewActionLanes([marker('end', 10)], viewport);
  expect(layout.items[0]!.left + layout.items[0]!.width).toBeLessThanOrEqual(100);
  expect(layout.items[0]!.width).toBe(REVIEW_ACTION_MIN_POINT_WIDTH_PX);
});
