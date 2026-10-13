import { expect, it } from 'vitest';
import { layoutReviewActionLanes, REVIEW_ACTION_MIN_POINT_WIDTH_PX } from './action-lanes';
import { reviewActionLane } from './action-lanes';
import type { ReviewTelemetryMarker } from './telemetry';

const viewport = { duration: 10, width: 100, zoom: 1 };
it('reserves keyboard, mouse and cursor rows even with no facts', () => {
  expect(layoutReviewActionLanes([], viewport).laneCount).toBe(3);
});

it('keeps observed command holds and modifier combinations in the keyboard family', () => {
  for (const eventType of ['KEY', 'KEY_HOLD', 'KEY_MODIFIERS', 'typing'])
    expect(reviewActionLane({ eventType, ref: { kind: 'action', id: eventType } })).toBe(0);
});

it('keeps typing and keys above mouse actions and cursor dwell despite collisions', () => {
  const entries: ReviewTelemetryMarker[] = [
    { ref: { kind: 'action', id: 'key' }, eventType: 'KEY', start: 1, end: 1 },
    { ref: { kind: 'signal', id: 'typing' }, eventType: 'typing', start: 1, end: 2 },
    { ref: { kind: 'action', id: 'mouse' }, eventType: 'CLICK', start: 1, end: 1 },
    { ref: { kind: 'signal', id: 'dwell' }, eventType: 'cursor-idle', start: 1, end: 2 },
  ];
  const layout = layoutReviewActionLanes(entries, viewport);
  expect(layout.items.map(({ lane }) => lane)).toEqual([2, 0, 1]);
  expect(layout.items.find(({ lane }) => lane === 0)?.members.map(({ ref }) => ref.id)).toEqual([
    'key',
    'typing',
  ]);
});
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

it('groups colliding mouse events by screen width while preserving every identity', () => {
  const layout = layoutReviewActionLanes(
    [marker('a', 1), marker('b', 1.01), marker('c', 1.03), marker('d', 1.05)],
    viewport
  );
  expect(layout.items.map((item) => item.lane)).toEqual([1]);
  expect(layout.laneCount).toBe(3);
  expect(layout.items.every((item) => item.left >= 0)).toBe(true);
  // Screen coordinates: 0.01s of source spans less than the point-event floor.
  expect(layout.items[0]!.width).toBeGreaterThanOrEqual(REVIEW_ACTION_MIN_POINT_WIDTH_PX);
});

it('clusters long intervals that intersect point-event floors', () => {
  const layout = layoutReviewActionLanes(
    [marker('a', 0, 2), marker('b', 2.5, 3), marker('c', 3, 5)],
    viewport
  );
  // The readable target floor overlaps both following starts at this coarse scale.
  expect(layout.items.map((item) => item.lane)).toEqual([1]);
  expect(layout.laneCount).toBe(3);
});

it('joins overlapping mouse hit rectangles without crossing semantic rows', () => {
  // 10s plane over 100px: 1s = 10px, so point-event floors keep 0.01s events apart.
  const layout = layoutReviewActionLanes(
    [marker('a', 0, 1.2), marker('b', 1.2, 1.21), marker('c', 1.3)],
    viewport
  );
  expect(layout.items.map((item) => item.lane)).toEqual([1]);
});

it('clusters cursor markers without silently dropping source identities', () => {
  const layout = layoutReviewActionLanes(
    [
      marker('c1', 0.1, 0.1, 'cursor'),
      marker('c2', 0.12, 0.12, 'cursor'),
      marker('c2', 0.3, 0.3, 'cursor'),
      marker('a1', 0.11),
    ],
    viewport
  );
  expect(layout.items).toHaveLength(2);
  expect(layout.items.filter((item) => item.marker.ref.kind === 'cursor')).toHaveLength(1);
  expect(layout.items.flatMap((item) => item.members)).toHaveLength(4);
});

it('keeps adjacent long intervals on the same lane at every fractional zoom', () => {
  const markers = [marker('idle1', 0.13, 3.27), marker('idle2', 3.27, 6.41)];
  for (let step = 0; step <= 100; step++) {
    const layout = layoutReviewActionLanes(markers, {
      duration: 12.01,
      width: 1063,
      zoom: 1 + step / 7,
    });
    expect(layout.items.map((item) => item.lane)).toEqual([1, 1]);
  }
});

it('rejects an invalid viewport instead of manufacturing a layout', () => {
  expect(() => layoutReviewActionLanes([], { duration: 0, width: 100, zoom: 1 })).toThrow();
  expect(layoutReviewActionLanes([], viewport)).toEqual({ items: [], laneCount: 3 });
});

it('keeps every dense marker in the layout; no packed item is hidden', () => {
  const markers = Array.from({ length: 12 }, (_, index) => marker(`e${index}`, 1 + index / 200));
  const layout = layoutReviewActionLanes(markers, viewport);
  expect(layout.laneCount).toBe(3);
  expect(layout.items.flatMap((item) => item.members.map((member) => member.ref.id))).toEqual(
    markers.map((entry) => entry.ref.id)
  );
});

it('keeps end-of-recording markers inside the scroll strip without a second horizontal axis', () => {
  const layout = layoutReviewActionLanes([marker('end', 10)], viewport);
  expect(layout.items[0]!.left + layout.items[0]!.width).toBeLessThanOrEqual(100);
  expect(layout.items[0]!.width).toBe(REVIEW_ACTION_MIN_POINT_WIDTH_PX);
});

it('caps dense histories at three lanes and repacks separated events at high zoom', () => {
  const markers = Array.from({ length: 100 }, (_, i) => marker(`dense${i}`, 1 + i / 10));
  const fit = layoutReviewActionLanes(markers, { duration: 3600, width: 1000, zoom: 1 });
  expect(fit.laneCount).toBeLessThanOrEqual(3);
  const expanded = layoutReviewActionLanes(markers, { duration: 3600, width: 1000, zoom: 2000 });
  expect(expanded.laneCount).toBe(3);
  expect(expanded.items).toHaveLength(markers.length);
});

it('packs thousands of simultaneous mixed events without losing identities or overlapping groups', () => {
  const markers = Array.from({ length: 3000 }, (_, i) =>
    marker(String(i), 9.99, 10, i % 2 ? 'action' : 'signal')
  );
  const layout = layoutReviewActionLanes(markers, viewport);
  expect(layout.items).toHaveLength(1);
  expect(
    new Set(layout.items.flatMap((item) => item.members.map((m) => m.ref.kind + m.ref.id))).size
  ).toBe(3000);
  for (const item of layout.items)
    expect(item.left + item.width).toBeLessThanOrEqual(viewport.width);
});

it('keeps every lane disjoint across fractional widths, dense points and long intervals', () => {
  const markers = Array.from({ length: 180 }, (_, i) =>
    marker(String(i), (i * 0.137) % 9, Math.min(10, ((i * 0.137) % 9) + (i % 7 === 0 ? 2 : 0)))
  );
  for (const zoom of [1, 1.3, 8.7, 80]) {
    const layout = layoutReviewActionLanes(markers, { duration: 10, width: 100.3, zoom });
    expect(layout.laneCount).toBeLessThanOrEqual(3);
    expect(layout.items.flatMap((item) => item.members)).toHaveLength(markers.length);
    for (let lane = 0; lane < 3; lane++) {
      const items = layout.items.filter((item) => item.lane === lane);
      for (let i = 1; i < items.length; i++)
        expect(items[i]!.left + 1e-7).toBeGreaterThanOrEqual(
          items[i - 1]!.left + items[i - 1]!.width
        );
    }
  }
});
