// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewTelemetryStrip } from './timeline-telemetry';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const marker = (
  kind: 'action' | 'signal',
  id: string,
  start: number,
  end = start
): ReviewTelemetryMarker => ({
  ref: { kind, id },
  eventType: 'eventClick',
  start,
  end,
});

const render = (markers: ReviewTelemetryMarker[]) =>
  act(() => {
    root.render(
      <ReviewTelemetryStrip
        markers={markers}
        duration={10}
        time={0}
        width={1000}
        zoom={1}
        onMarker={vi.fn()}
      />
    );
  });

it('separates colliding markers into disjoint lanes with a consistent pitch', () => {
  render([
    marker('action', 'a', 1, 2),
    marker('action', 'b', 1.1, 2.1),
    marker('action', 'c', 1.2, 2.2),
  ]);
  const buttons = [...host.querySelectorAll<HTMLButtonElement>('button')];
  expect(buttons).toHaveLength(3);
  for (const button of buttons) expect(button.style.height).toBe('20px');
  const tops = new Set(buttons.map((button) => button.style.top));
  expect(tops.has('0px')).toBe(true);
  expect(tops.has('24px')).toBe(true);
  expect(buttons.some((button) => button.style.top === '7px')).toBe(false);
  const laneTops = buttons.map((button) => Number(button.style.top.replace('px', '')));
  expect(new Set(laneTops).size).toBe(laneTops.length);
});

it('groups overflow within three rows and exposes every member for selection', async () => {
  const markers = Array.from({ length: 10 }, (_, i) => ({
    ...marker('action', String(i), 1),
    eventType: 'CLICK',
  }));
  const onMarker = vi.fn();
  act(() =>
    root.render(
      <ReviewTelemetryStrip
        markers={markers}
        duration={10}
        time={0}
        width={1000}
        zoom={1}
        selectedTelemetryRef={markers[8]!.ref}
        animatedIds={new Set([markers[8]!.ref.id])}
        onMarker={onMarker}
      />
    )
  );
  const strip = host.firstElementChild as HTMLDivElement;
  expect(strip.style.height).toBe('68px');
  expect(strip.className).not.toContain('overflow-y-auto');
  const cluster = host.querySelector<HTMLButtonElement>(
    '[data-ui="gallery.videoReview.historyCluster"] button'
  )!;
  expect(cluster.getAttribute('aria-pressed')).toBe('true');
  expect(cluster.getAttribute('data-animated')).toBe('true');
  await act(async () => cluster.click());
  const options = [...document.querySelectorAll<HTMLButtonElement>('[role=option]')];
  expect(options).toHaveLength(8);
  expect(options[0]!.textContent).toContain('0:01.000');
  expect(options[6]!.textContent).toContain('gallery.videoReview.clickAnimation');
  await act(async () => options[6]!.click());
  expect(onMarker).toHaveBeenCalledWith(markers[8]);
});

it('reserves no lane space for an empty history', () => {
  render([]);
  const strip = host.firstElementChild as HTMLDivElement;
  expect(strip.style.height).toBe('0px');
});

it('exposes readable event text for a history interval with available space', () => {
  render([{ ...marker('action', 'readable', 1, 3), eventType: 'SCROLL' }]);
  expect(host.querySelector('button')?.textContent).toContain('gallery.videoReview.eventScroll');
});

it('describes the captured target and full interval in the action hint', () => {
  render([{ ...marker('signal', 'typing', 1, 4), eventType: 'typing', target: 'Search projects' }]);
  const button = host.querySelector('button')!;
  expect(button.title).toContain('Search projects');
  expect(button.title).toContain('1.0');
  expect(button.title).toContain('4.0');
  expect(button.getAttribute('aria-label')).toContain('Search projects');
});

it('holds groups during zoom then repacks without changing height or selected identity', async () => {
  vi.useFakeTimers();
  const markers = Array.from({ length: 10 }, (_, i) => marker('action', String(i), 1 + i / 100));
  const show = (zoom: number) =>
    act(() =>
      root.render(
        <ReviewTelemetryStrip
          markers={markers}
          duration={10}
          time={0}
          width={1000}
          zoom={zoom}
          selectedTelemetryRef={markers[8]!.ref}
          onMarker={vi.fn()}
        />
      )
    );
  show(1);
  const strip = host.firstElementChild as HTMLDivElement;
  expect(strip.style.height).toBe('68px');
  expect(host.querySelectorAll('button')).toHaveLength(3);
  show(50);
  expect(host.querySelectorAll('button')).toHaveLength(3);
  await act(async () => vi.advanceTimersByTime(200));
  show(100);
  await act(async () => vi.advanceTimersByTime(100));
  expect(host.querySelectorAll('button')).toHaveLength(3);
  await act(async () => vi.advanceTimersByTime(150));
  expect(host.querySelectorAll('button')).toHaveLength(10);
  expect(new Set([...host.querySelectorAll('button')].map((button) => button.style.top))).toEqual(
    new Set(['0px'])
  );
  expect(strip.style.height).toBe('68px');
  expect(host.querySelectorAll('[aria-pressed=true]')).toHaveLength(1);
  show(1);
  await act(async () => vi.advanceTimersByTime(250));
  expect(host.querySelectorAll('button')).toHaveLength(3);
  expect(strip.style.height).toBe('68px');
});
