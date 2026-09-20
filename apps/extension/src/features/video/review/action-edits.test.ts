import { expect, it } from 'vitest';
import { planReviewActionEdits } from './action-edits';
import { createQuickEditZoomRegion } from './advanced/zoom';
import type { ReviewTelemetryMarker } from './telemetry';
import type { ReviewEdit } from './types';

const marker: ReviewTelemetryMarker = {
  ref: { kind: 'signal', id: 'typing' },
  eventType: 'typing',
  start: 2,
  end: 6,
  focusPoint: { x: 0.2, y: 0.7 },
};
const plan = (options: Partial<Parameters<typeof planReviewActionEdits>[0]> = {}) =>
  planReviewActionEdits({
    marker,
    duration: 10,
    edits: [],
    regions: [],
    boundaries: [0, 2, 4, 6, 8, 10],
    snapToKeyframes: false,
    ...options,
  });
const cut: ReviewEdit = {
  id: 'cut',
  kind: 'cut',
  start: 0,
  end: 2,
  requestedStart: 0,
  requestedEnd: 2,
};

it('keeps long action intervals exact and applies a restrained focus at verified coordinates', () => {
  const result = plan();
  expect(result.cut).toMatchObject({ start: 2, end: 6, kind: 'cut' });
  expect(result.speed).toMatchObject({ start: 2, end: 6, kind: 'speed', rate: 2 });
  expect(result.focus).toMatchObject({
    start: 2,
    end: 6,
    transform: { scale: 1.5, centerX: 0.2, centerY: 0.7 },
  });
  expect(result.contextual).toBe(false);
});
it('maps focus through cuts and speed, while refusing an overlapping source edit', () => {
  const speed: ReviewEdit = {
    id: 's',
    kind: 'speed',
    start: 2,
    end: 6,
    requestedStart: 2,
    requestedEnd: 6,
    rate: 2,
    audio: 'speed',
  };
  const result = plan({ edits: [cut, speed] });
  expect(result.focus).toMatchObject({ start: 0, end: 2 });
  expect(result.cut).toBeNull();
  expect(result.speed).toBeNull();
  expect(result.editReason).toBe('overlap');
});
it('hides commands for removed actions and does not span partial cuts or occupied focus', () => {
  const removed = { ...cut, start: 2, end: 6, requestedStart: 2, requestedEnd: 6 };
  expect(plan({ edits: [removed] })).toMatchObject({
    removed: true,
    focus: null,
    cut: null,
    speed: null,
  });
  const partial = plan({ edits: [{ ...removed, end: 4, requestedEnd: 4 }] });
  expect(partial).toMatchObject({ removed: false, focus: null, focusReason: 'removed' });
  const region = createQuickEditZoomRegion({ id: 'z', at: 3 });
  expect(plan({ regions: [region] })).toMatchObject({ focus: null, focusReason: 'focus-overlap' });
  expect(plan({ regions: [{ ...region, dormant: true }] }).focus).not.toBeNull();
});
it('uses a bounded context for point clicks, including EOF, and defaults unknown position to center', () => {
  for (const time of [0, 5, 10]) {
    const result = plan({
      marker: { ref: { kind: 'action', id: 'click' }, eventType: 'CLICK', start: time, end: time },
    });
    expect(result.range.end - result.range.start).toBe(2);
    expect(result.range.start).toBeGreaterThanOrEqual(0);
    expect(result.range.end).toBeLessThanOrEqual(10);
    expect(result.focus?.transform).toEqual({ scale: 2.5, centerX: 0.5, centerY: 0.5 });
  }
  expect(
    plan({ marker: { ...marker, eventType: 'DOUBLE_CLICK', start: 2, end: 2.1 } }).contextual
  ).toBe(true);
});
it('follows safe-boundary admission and forbids cutting the whole video', () => {
  expect(plan({ boundaries: undefined })).toMatchObject({
    cut: null,
    speed: null,
    editReason: 'loading',
  });
  const short = { ...marker, start: 2.1, end: 2.9 };
  expect(plan({ marker: short, snapToKeyframes: true }).cut).toBeNull();
  expect(plan({ marker: short }).cut).toMatchObject({ start: 2.1, end: 2.9 });
  const entire = plan({ marker: { ...marker, start: 0, end: 10 } });
  expect(entire.cut).toBeNull();
  expect(entire.speed).not.toBeNull();
});
