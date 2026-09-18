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
  for (const button of buttons) expect(button.style.height).toBe('10px');
  const tops = new Set(buttons.map((button) => button.style.top));
  expect(tops.has('0px')).toBe(true);
  expect(tops.has('14px')).toBe(true);
  expect(buttons.some((button) => button.style.top === '7px')).toBe(false);
  const laneTops = buttons.map((button) => Number(button.style.top.replace('px', '')));
  expect(new Set(laneTops).size).toBe(laneTops.length);
});

it('collapses the dense tail into a full-height overflow row with kind-qualified keys', () => {
  const markers = [0, 1, 2, 3].map((value) => marker('action', `e${value}`, 1 + value / 50));
  markers.push(marker('signal', 's1', 1.02));
  render(markers);
  const buttons = [...host.querySelectorAll<HTMLButtonElement>('button')];
  expect(buttons).toHaveLength(4);
  const chip = host.querySelector<HTMLDivElement>('[data-ui="gallery.videoReview.actionOverflow"]');
  expect(chip).not.toBeNull();
  const trigger = chip!.querySelector('button')!;
  expect(trigger.style.top).toBe('42px');
  expect(trigger.style.height).toBe('28px');
  expect(host.textContent).toContain('+2');
});

it('reserves no lane space for an empty history', () => {
  render([]);
  const strip = host.firstElementChild as HTMLDivElement;
  expect(strip.style.height).toBe('0px');
  expect(host.querySelector('[data-ui="gallery.videoReview.actionOverflow"]')).toBeNull();
});
