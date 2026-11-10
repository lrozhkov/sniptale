// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { reviewTimelineMagnetPriority, snapReviewMagnet } from './timeline-magnets';

it('prefers the nearer row for endpoints within one pixel horizontally', () => {
  const targets = [
    { time: 5.04, y: 50 },
    { time: 5.01, y: 200 },
  ];
  expect(snapReviewMagnet(5, targets, 0.8, 60).time).toBe(5.04);
  expect(snapReviewMagnet(5, targets, 0.8, 190).time).toBe(5.01);
});
it('prefers the upper row at equal vertical distance regardless of endpoint order', () => {
  const targets = [
    { time: 5.02, y: 120 },
    { time: 5.04, y: 80 },
  ];
  expect(snapReviewMagnet(5, targets, 0.8, 100).time).toBe(5.04);
  expect(snapReviewMagnet(5, targets.toReversed(), 0.8, 100).time).toBe(5.04);
});
it('keeps the horizontally closer endpoint when row preference exceeds one pixel, and respects bypass', () => {
  const targets = [
    { time: 5.2, y: 50 },
    { time: 5.01, y: 200 },
  ];
  expect(snapReviewMagnet(5, targets, 0.8, 50).time).toBe(5.01);
  expect(snapReviewMagnet(5, targets, 0, 50)).toEqual({ time: 5, candidate: null });
  expect(snapReviewMagnet(8, targets, 0.8, 50)).toEqual({ time: 8, candidate: null });
});

it('prefers authored boundaries over closer history events, but retains history as a fallback', () => {
  const event = { time: 5.001, y: 100, priority: 1 };
  const authored = { time: 5.4, y: 300, priority: 0 };
  expect(snapReviewMagnet(5, [event, authored], 0.8, 100).time).toBe(5.4);
  expect(snapReviewMagnet(5, [event], 0.8, 100).time).toBe(event.time);
  expect(snapReviewMagnet(5, [event, { ...authored, time: 6 }], 0.8, 100).time).toBe(event.time);
});
it('excludes cursor geometry and grouped entities while retaining individual history and authored items', () => {
  const host = document.createElement('div');
  host.innerHTML = `
    <div data-ui="gallery.videoReview.historyStrip">
      <div data-history-family="cursor"><button id="cursor"></button></div>
      <div data-review-snap-priority="none"><button id="group"></button></div>
      <button id="event"></button>
    </div>
    <div data-ui="cursorFocusPath.timelineKeys"><button id="key"></button></div>
    <button id="authored"></button>`;
  const node = (id: string) => host.querySelector<HTMLElement>(`#${id}`)!;
  for (const id of ['cursor', 'group', 'key'])
    expect(reviewTimelineMagnetPriority(node(id))).toBeNull();
  expect(reviewTimelineMagnetPriority(node('event'))).toBe(1);
  expect(reviewTimelineMagnetPriority(node('authored'))).toBe(0);
});
