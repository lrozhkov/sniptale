// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  ReviewTimelineMagnets,
  useReviewTimelineSnap,
  reviewTimelineMagnetPriority,
  snapReviewMagnet,
} from './timeline-magnets';

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
it('excludes recorded mouse and keyboard history while retaining authored effect targets', () => {
  const host = document.createElement('div');
  host.innerHTML = `
    <div data-ui="gallery.videoReview.historyStrip">
      <div data-history-family="cursor"><button id="cursor"></button></div>
      <div data-review-snap-priority="none"><button id="group"></button></div>
      <button id="event"></button>
      <div data-history-family="keyboard"><button id="keyboard"></button></div>
      <div data-history-family="mouse"><button id="mouse"></button></div>
    </div>
    <div data-ui="cursorFocusPath.timelineKeys"><button id="key"></button></div>
    <button id="authored"></button>`;
  const node = (id: string) => host.querySelector<HTMLElement>(`#${id}`)!;
  for (const id of ['cursor', 'group', 'key', 'event', 'keyboard', 'mouse'])
    expect(reviewTimelineMagnetPriority(node(id))).toBeNull();
  expect(reviewTimelineMagnetPriority(node('authored'))).toBe(0);
});

let mounted: { root: Root; host: HTMLDivElement } | undefined;
afterEach(() => {
  if (mounted) {
    act(() => mounted!.root.unmount());
    mounted.host.remove();
    mounted = undefined;
  }
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function mountMagnetGesture(
  options: {
    sourceTime?: (display: number) => number;
    clock?: Parameters<typeof useReviewTimelineSnap>[0];
  } = {}
) {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  mounted = { root, host };
  let snap!: ReturnType<typeof useReviewTimelineSnap>;
  function Source() {
    snap = useReviewTimelineSnap(options.clock);
    return createElement(
      'button',
      {
        'data-testid': 'source',
        'data-review-action-key': 'source',
        'data-review-snap-start': '4.96',
        'data-review-snap-end': '4.98',
      },
      createElement('span', { 'data-review-snap-start': '4.97' })
    );
  }
  const target = (id: string, start: string, end?: string) =>
    createElement('button', {
      key: id,
      'data-testid': id,
      'data-review-snap-start': start,
      ...(end === undefined ? {} : { 'data-review-snap-end': end }),
    });
  act(() =>
    root.render(
      <ReviewTimelineMagnets sourceTime={options.sourceTime}>
        <div data-ui="gallery.videoReview.timePlane">
          <Source />
          {target('authored', '5', '6')}
          {target('point', '8', '8')}
          {target('hidden', '4.96')}
          {target('invalid', 'NaN', '-1')}
          {target('blank', ' ')}
          <div data-history-family="mouse">{target('mouse', '4.97', '4.98')}</div>
          <div data-history-family="keyboard">{target('keyboard', '4.97', '4.98')}</div>
        </div>
      </ReviewTimelineMagnets>
    )
  );
  const node = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
  for (const element of host.querySelectorAll<HTMLElement>('[data-review-snap-start]')) {
    const rect = new DOMRect(0, 40, 20, 20);
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect);
    vi.spyOn(element, 'getClientRects').mockReturnValue(
      Object.assign(element === node('hidden') ? [] : [rect], {
        item: (index: number) => (index === 0 ? rect : null),
      })
    );
  }
  const pointer = (type: string, element: Element = node('source'), pointerId = 1, button = 0) => {
    const event = new MouseEvent(type, { bubbles: true, clientY: 50, button });
    Object.defineProperty(event, 'pointerId', { value: pointerId });
    act(() => element.dispatchEvent(event));
  };
  return { node, pointer, snap: (...args: Parameters<typeof snap>) => snap(...args), host, root };
}

it('snaps the real gesture to authored bounds, excludes history, and clears Alt/end highlights', () => {
  const view = mountMagnetGesture();
  view.pointer('pointerdown');
  expect(view.snap(4.96, [], 0.1)).toEqual({ time: 5, candidate: 5 });
  expect(view.node('authored').dataset['reviewMagnetEdge']).toBe('start');
  expect(view.node('mouse').dataset['reviewMagnetEdge']).toBeUndefined();
  expect(view.node('keyboard').dataset['reviewMagnetEdge']).toBeUndefined();
  view.node('authored').dataset['reviewSnapStart'] = '7';
  expect(view.snap(4.96, [], 0.1).time).toBe(5);
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt' })));
  expect(view.node('authored').dataset['reviewMagnetEdge']).toBeUndefined();
  expect(view.snap(4.96, [], 0.1).candidate).toBeNull();
  act(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt' })));
  expect(view.snap(5.98, [], 0.1).time).toBe(6);
  view.pointer('pointermove', view.node('source'), 2);
  expect(view.node('authored').dataset['reviewMagnetEdge']).toBe('end');
  view.pointer('pointermove');
  expect(view.node('authored').dataset['reviewMagnetEdge']).toBeUndefined();
  expect(view.snap(7.98, [], 0.1).time).toBe(8);
  expect(view.node('point').dataset['reviewMagnetEdge']).toBe('point');
  view.pointer('pointerup');
  expect(view.node('point').dataset['reviewMagnetEdge']).toBe('point');
  act(() => vi.runOnlyPendingTimers());
  expect(view.node('point').dataset['reviewMagnetEdge']).toBeUndefined();
  expect(view.snap(8.96, [9], 0.1)).toEqual({ time: 9, candidate: 9 });
});

it('applies display/result clocks and bounds, then clears cancelled or blurred gestures', () => {
  const view = mountMagnetGesture({
    sourceTime: (display) => display / 2,
    clock: { output: (source) => source * 3 },
  });
  const plane = view.host.querySelector('[data-ui="gallery.videoReview.timePlane"]')!;
  plane.setAttribute('data-review-snap-domain', 'display');
  view.pointer('pointerdown');
  expect(view.snap(7.49, [], 0.1, { start: 0, end: 7.6 }).time).toBe(7.5);
  expect(view.snap(8.99, [], 0.1, { start: 0, end: 8.5 }).candidate).toBeNull();
  view.pointer('pointercancel');
  act(() => vi.runOnlyPendingTimers());
  expect(view.node('authored').dataset['reviewMagnetEdge']).toBeUndefined();
  view.pointer('pointerdown');
  expect(view.snap(7.49, [], 0.1).time).toBe(7.5);
  act(() => window.dispatchEvent(new Event('blur')));
  expect(view.node('authored').dataset['reviewMagnetEdge']).toBeUndefined();
  expect(view.snap(7.49, [7.55], 0.1).time).toBe(7.55);
  view.pointer('pointerdown', view.node('source'), 1, 2);
  expect(view.snap(7.49, [], 0.1).candidate).toBeNull();
  view.pointer('pointerdown', view.host);
  expect(view.snap(7.49, [], 0.1).candidate).toBeNull();
});

it('honors a consumer display clock and removes a selected target when unmounted', () => {
  const view = mountMagnetGesture({
    sourceTime: (display) => display / 2,
    clock: { output: (source) => source * 3, fromDisplay: (display) => display + 10 },
  });
  view.host
    .querySelector('[data-ui="gallery.videoReview.timePlane"]')!
    .setAttribute('data-review-snap-domain', 'display');
  view.pointer('pointerdown');
  expect(view.snap(14.98, [], 0.1).time).toBe(15);
  const target = view.node('authored');
  expect(target.dataset['reviewMagnetEdge']).toBe('start');
  act(() => view.root.unmount());
  expect(target.dataset['reviewMagnetEdge']).toBeUndefined();
  mounted?.host.remove();
  mounted = undefined;
});
