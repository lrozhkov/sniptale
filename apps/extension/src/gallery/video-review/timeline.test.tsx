// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReviewAnchor } from '../../features/video/review/types';
import { ReviewTimeline } from './timeline';
vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

const environment = {
  host: null as HTMLDivElement | null,
  root: null as Root | null,
};

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  environment.host = document.createElement('div');
  environment.root = createRoot(environment.host);
});

afterEach(async () => {
  await act(async () => environment.root!.unmount());
  vi.unstubAllGlobals();
});

function renderTimeline(overrides: Partial<Parameters<typeof ReviewTimeline>[0]> = {}) {
  const props: Parameters<typeof ReviewTimeline>[0] = {
    duration: 4,
    time: 2,
    playing: false,
    selection: { kind: 'point', time: 2 },
    annotations: [],
    markers: [],
    onSeek: vi.fn(),
    onSelect: vi.fn(),
    onPlay: vi.fn(),
    onMarker: vi.fn(),
    onComment: vi.fn(),
    ...overrides,
  };
  act(() => environment.root!.render(<ReviewTimeline {...props} />));
  return { props, host: environment.host! };
}

type PlaneEvent = { type: string; x: number; button?: number };

function planeWithMetrics(host: HTMLDivElement) {
  const plane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.timePlane"]')!;
  vi.spyOn(plane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 80));
  Object.assign(plane, {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
  });
  return plane;
}

function dispatchPlane(plane: HTMLElement, events: PlaneEvent[]) {
  for (const event of events) {
    act(() =>
      plane.dispatchEvent(
        new MouseEvent(event.type, {
          bubbles: true,
          button: event.button ?? 0,
          clientX: event.x,
        })
      )
    );
  }
}

it('keeps original time coordinates through zoom and preserves separate comment navigation', () => {
  const annotation = { id: 'a', text: 'Comment', anchor: { kind: 'point' as const, time: 2 } };
  const marker = {
    ref: { kind: 'action' as const, id: 'click' },
    eventType: 'CLICK',
    start: 1,
    end: 1.1,
  };
  const { host, props } = renderTimeline({ annotations: [annotation], markers: [marker] });
  expect(host.querySelector('[aria-label="gallery.videoReview.point"]')).toBeNull();
  expect(host.querySelector('input[type="number"]')).toBeNull();
  act(() =>
    host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.zoomIn"]')!.click()
  );
  expect(
    host.querySelector('[aria-label="gallery.videoReview.position"]')?.getAttribute('aria-valuemax')
  ).toBe('4');
  const plane = planeWithMetrics(host);
  dispatchPlane(plane, [{ type: 'pointerdown', x: 300 }]);
  expect(props.onSeek).toHaveBeenCalledWith(3);
  expect(props.onSelect).toHaveBeenCalledWith({ kind: 'point', time: 3 });
  act(() =>
    host.querySelector<HTMLButtonElement>('[title="gallery.videoReview.eventClick · 1.0"]')!.click()
  );
  expect(props.onMarker).toHaveBeenCalledWith(marker);
  act(() => host.querySelector<HTMLButtonElement>('[title="Comment"]')!.click());
  expect(props.onComment).toHaveBeenCalledWith(annotation);
});

it('commits a range from a drag and restores the previous state through Escape', () => {
  const onRangeCommit = vi.fn();
  const selection: ReviewAnchor = { kind: 'range', start: 1, end: 3 };
  const { host, props } = renderTimeline({ selection, onRangeCommit });
  const plane = planeWithMetrics(host);
  dispatchPlane(plane, [
    { type: 'pointerdown', x: 100 },
    { type: 'pointermove', x: 150 },
    { type: 'pointermove', x: 250 },
    { type: 'pointerup', x: 250 },
  ]);
  expect(props.onSelect).toHaveBeenCalledWith({ kind: 'range', start: 1, end: 2.5 });
  expect(onRangeCommit).toHaveBeenCalledWith({ kind: 'range', start: 1, end: 2.5 });
  dispatchPlane(plane, [
    { type: 'pointerdown', x: 100 },
    { type: 'pointermove', x: 300 },
  ]);
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(props.onSeek).toHaveBeenCalledWith(2, false);
  expect(props.onSelect).toHaveBeenCalledWith(selection);
});

it('ignores pointer traffic without a drag and secondary buttons', () => {
  const { host, props } = renderTimeline();
  const plane = planeWithMetrics(host);
  dispatchPlane(plane, [
    { type: 'pointermove', x: 300 },
    { type: 'pointerdown', x: 300, button: 2 },
    { type: 'pointermove', x: 350 },
  ]);
  expect(props.onSeek).not.toHaveBeenCalled();
  expect(props.onSelect).not.toHaveBeenCalled();
  dispatchPlane(plane, [
    { type: 'pointerdown', x: 300 },
    { type: 'pointercancel', x: 300 },
    { type: 'pointerup', x: 300 },
  ]);
  expect(props.onSeek).toHaveBeenCalledTimes(1);
});

it('groups cursor telemetry and deduplicates dense cursor samples', () => {
  const action = {
    ref: { kind: 'action' as const, id: 'click' },
    eventType: 'CLICK',
    start: 0.5,
    end: 0.5,
  };
  const cursors = [0.1, 0.13, 0.2, 1.1].map((start, index) => ({
    ref: { kind: 'cursor' as const, id: `cursor${index}` },
    eventType: 'cursor',
    start,
    end: start,
  }));
  const { host, props } = renderTimeline({ markers: [action, ...cursors] });
  const cursorButtons = [
    ...host.querySelectorAll<HTMLButtonElement>('button[title^="gallery.videoReview.eventCursor"]'),
  ];
  expect(cursorButtons).toHaveLength(3);
  for (const button of cursorButtons) expect(button.style.width).toBe('6px');
  act(() =>
    host.querySelector<HTMLButtonElement>('[title^="gallery.videoReview.eventClick"]')!.click()
  );
  expect(props.onMarker).toHaveBeenCalledWith(action);
});

it('exposes transport, volume, zoom range, and edited result duration in the toolbar', () => {
  const edits = [
    { id: 'c', kind: 'cut' as const, start: 2, end: 3, requestedStart: 2, requestedEnd: 3 },
  ];
  const { host, props } = renderTimeline({ edits, volume: 0.5, onVolume: vi.fn() });
  act(() =>
    host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.play"]')!.click()
  );
  expect(props.onPlay).toHaveBeenCalled();
  expect(
    host.querySelector('output[title="gallery.videoReview.resultDuration"]')?.textContent
  ).toBe('→ 3.0');
  const volume = host.querySelector<HTMLInputElement>('[aria-label="gallery.videoReview.volume"]')!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setValue.call(volume, '0.25');
    volume.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(props.onVolume).toHaveBeenCalledWith(0.25);
  act(() =>
    host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.zoomIn"]')!.click()
  );
  act(() =>
    host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.fit"]')!.click()
  );
  const zoomOut = host.querySelector<HTMLButtonElement>(
    '[aria-label="gallery.videoReview.zoomOut"]'
  )!;
  expect(zoomOut.disabled).toBe(true);
  act(() => zoomOut.click());
});

it('renders ruler labels at the unit chosen for the current scale', () => {
  const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  try {
    const { host } = renderTimeline();
    const ruler = host.querySelector('[data-ui="gallery.videoReview.ruler"]')!;
    expect(ruler.querySelectorAll('span').length).toBeGreaterThan(0);
    expect(ruler.textContent).toContain('1.0');
  } finally {
    clientWidth.mockRestore();
  }
});
