// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
      unobserve() {}
      disconnect() {}
    }
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
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

function changeZoom(host: HTMLElement, value: string) {
  const slider = host.querySelector<HTMLInputElement>('[aria-label="videoEditor.timeline.zoom"]')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(slider, value);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it('keeps source-time playback visible through cuts and clamps without seeking', () => {
  const { host, props } = renderTimeline({ duration: 10, time: 0 });
  const viewport = host.querySelector<HTMLElement>(
    '[data-ui="gallery.videoReview.timelineViewport"]'
  )!;
  const plane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.timePlane"]')!;
  const gutter = Number.parseFloat(plane.style.getPropertyValue('--review-track-gutter'));
  const width = viewport.clientWidth - gutter;
  changeZoom(host, '50');
  for (const time of [0, 0.5, 2, 6, 9, 10]) {
    renderTimeline({ ...props, time, playing: true });
    const x = (time / 10) * width * 4 - viewport.scrollLeft;
    expect(x).toBeGreaterThanOrEqual(-1);
    expect(x).toBeLessThanOrEqual(width + 1);
    act(() => viewport.dispatchEvent(new Event('scroll')));
  }
  expect(props.onSeek).not.toHaveBeenCalled();
  expect(props.onSelect).not.toHaveBeenCalled();
});

it('preserves a visible Play position and yields to horizontal navigation until the next Play', () => {
  const { host, props } = renderTimeline({ duration: 10, time: 2 });
  const viewport = host.querySelector<HTMLElement>(
    '[data-ui="gallery.videoReview.timelineViewport"]'
  )!;
  changeZoom(host, '50');
  viewport.scrollLeft = 400;
  act(() => viewport.dispatchEvent(new Event('scroll')));
  renderTimeline({ ...props, playing: true });
  expect(viewport.scrollLeft).toBe(400);
  act(() => viewport.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  const plane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.timePlane"]')!;
  act(() => plane.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
  viewport.scrollTop = 20;
  act(() => viewport.dispatchEvent(new Event('scroll')));
  renderTimeline({ ...props, playing: true, time: 6 });
  expect(viewport.scrollLeft).toBeGreaterThan(400);
  expect(viewport.scrollTop).toBe(20);
  viewport.scrollLeft = 250;
  act(() => viewport.dispatchEvent(new Event('scroll')));
  renderTimeline({ ...props, playing: true, time: 8 });
  expect(viewport.scrollLeft).toBe(250);
  renderTimeline({ ...props, playing: false, time: 8 });
  renderTimeline({ ...props, playing: true, time: 8 });
  expect(viewport.scrollLeft).toBeGreaterThan(250);
});

it('keeps range, paused and editing coordinates stable and resets follow for another source', () => {
  const { host, props } = renderTimeline({ duration: 10, time: 1, sourceId: 'first' });
  const viewport = host.querySelector<HTMLElement>(
    '[data-ui="gallery.videoReview.timelineViewport"]'
  )!;
  changeZoom(host, '50');
  renderTimeline({ ...props, playing: true, time: 3 });
  const left = viewport.scrollLeft;
  renderTimeline({ ...props, playing: true, time: 8, playbackRange: { start: 2, end: 9 } });
  expect(viewport.scrollLeft).toBe(left);
  renderTimeline({ ...props, time: 8 });
  expect(viewport.scrollLeft).toBe(left);
  renderTimeline({ ...props, playing: true, time: 3 });
  const plane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.timePlane"]')!;
  act(() => plane.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 2 })));
  renderTimeline({ ...props, playing: true, time: 8 });
  expect(viewport.scrollLeft).toBe(left);
  renderTimeline({ ...props, playing: true, time: 8, sourceId: 'second' });
  expect(viewport.scrollLeft).toBeGreaterThan(left);
  changeZoom(host, '25');
  const zoomedLeft = viewport.scrollLeft;
  renderTimeline({ ...props, playing: true, time: 9, sourceId: 'second' });
  expect(viewport.scrollLeft).toBe(zoomedLeft);
});

it.each([false, true])(
  'reveals requested ruler endpoints with playing=%s after manual navigation',
  (playing) => {
    const { host, props } = renderTimeline({
      duration: 10,
      time: 5,
      playing,
      navigationRevision: 0,
    });
    let navigationRevision = 0;
    const viewport = host.querySelector<HTMLElement>(
      '[data-ui="gallery.videoReview.timelineViewport"]'
    )!;
    const ruler = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.ruler"]')!;
    changeZoom(host, '50');
    for (const [key, time] of [
      ['End', 10],
      ['Home', 0],
    ] as const) {
      act(() => ruler.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
      expect(props.onSeek).toHaveBeenLastCalledWith(time, false);
      renderTimeline({ ...props, time, navigationRevision: ++navigationRevision });
      if (time === 0) expect(viewport.scrollLeft).toBe(0);
      else expect(viewport.scrollLeft).toBeGreaterThan(1800);
    }
  }
);

it('does not reclaim a manually scrolled viewport when playback ends', () => {
  const { host, props } = renderTimeline({ duration: 10, time: 5 });
  const viewport = host.querySelector<HTMLElement>(
    '[data-ui="gallery.videoReview.timelineViewport"]'
  )!;
  changeZoom(host, '50');
  renderTimeline({ ...props, playing: true });
  viewport.scrollLeft = 100;
  act(() => viewport.dispatchEvent(new Event('scroll')));
  renderTimeline({ ...props, time: 10, playing: false });
  expect(viewport.scrollLeft).toBe(100);
});

it('yields to accepted navigation outside viewport capture until the next Play', () => {
  const { host, props } = renderTimeline({ duration: 10, time: 2, navigationRevision: 0 });
  const viewport = host.querySelector<HTMLElement>(
    '[data-ui="gallery.videoReview.timelineViewport"]'
  )!;
  changeZoom(host, '50');
  renderTimeline({ ...props, playing: true, time: 4 });
  const left = viewport.scrollLeft;
  renderTimeline({ ...props, playing: true, time: 4.1, navigationRevision: 1 });
  renderTimeline({ ...props, playing: true, time: 8, navigationRevision: 1 });
  expect(viewport.scrollLeft).toBe(left);
  renderTimeline({ ...props, playing: false, time: 8, navigationRevision: 1 });
  renderTimeline({ ...props, playing: true, time: 8, navigationRevision: 1 });
  expect(viewport.scrollLeft).toBeGreaterThan(left);
});

it('holds each playback page until the edge and advances by most of a viewport', () => {
  const { host, props } = renderTimeline({ duration: 10, time: 0 });
  const viewport = host.querySelector<HTMLElement>(
    '[data-ui="gallery.videoReview.timelineViewport"]'
  )!;
  changeZoom(host, '50');
  for (const [time, left] of [
    [0, 0],
    [1.5, 0],
    [2.3, 0],
    [2.375, 680],
    [2.5, 680],
    [3.5, 680],
    [4.4, 680],
    [4.5, 1360],
    [10, 2400],
    [0, 0],
  ] as const) {
    renderTimeline({ ...props, playing: true, time });
    expect(viewport.scrollLeft).toBe(left);
    act(() => viewport.dispatchEvent(new Event('scroll')));
  }
  expect(props.onSeek).not.toHaveBeenCalled();
});
