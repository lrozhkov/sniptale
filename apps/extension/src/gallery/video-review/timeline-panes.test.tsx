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

it('clips labels outside the time plane with a separate vertical scroll surface', () => {
  const { host, props } = renderTimeline();
  const labels = host.querySelector<HTMLElement>(
    '[data-ui="gallery.videoReview.trackListViewport"]'
  );
  const plane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.timePlane"]')!;
  expect(labels).not.toBeNull();
  expect(labels!.style.scrollbarWidth).toBe('');
  expect(labels!.firstElementChild?.className).toContain('sticky');
  expect(labels!.style.scrollbarGutter).toBe('stable');
  const header = labels!.querySelector<HTMLElement>('[data-ui="gallery.videoReview.trackHeader"]')!;
  expect(header).not.toBeNull();
  expect(plane.contains(header)).toBe(false);
  act(() => header.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  expect(props.onSeek).not.toHaveBeenCalled();
  expect(props.onSelect).not.toHaveBeenCalled();
});

it('accepts alternating native scroll input without replaying a delayed mirror', () => {
  const { host, props } = renderTimeline({ busy: true });
  const labels = host.querySelector<HTMLElement>(
    '[data-ui="gallery.videoReview.trackListViewport"]'
  )!;
  const time = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.timelineViewport"]')!;
  expect(labels.hasAttribute('inert')).toBe(true);
  labels.scrollTop = 40;
  act(() => labels.dispatchEvent(new Event('scroll')));
  expect(time.scrollTop).toBe(40);
  time.scrollTop = 80;
  act(() => time.dispatchEvent(new Event('scroll')));
  expect(labels.scrollTop).toBe(80);
  act(() => {
    labels.dispatchEvent(new Event('scroll'));
    time.dispatchEvent(new Event('scroll'));
  });
  expect([labels.scrollTop, time.scrollTop]).toEqual([80, 80]);
  expect(host.querySelectorAll('[data-ui="gallery.videoReview.sourceLane"]')).toHaveLength(1);
  renderTimeline({ ...props, busy: false });
  expect(labels.hasAttribute('inert')).toBe(false);
});

it('keeps annotation clearance above the source header instead of inside its selected paint', () => {
  const rectangles = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      if (this.dataset['ui'] === 'gallery.videoReview.timePlane')
        return new DOMRect(200, 50, 700, 200);
      if (this.dataset['ui'] === 'gallery.videoReview.sourceLane')
        return new DOMRect(200, 120, 700, 48);
      if (this.dataset['reviewTrack'] === 'source') return new DOMRect(200, 96, 700, 72);
      if (this.querySelector('[data-ui="gallery.videoReview.ruler"]'))
        return new DOMRect(200, 50, 700, 28);
      return new DOMRect(0, 0, 800, 0);
    });
  try {
    const { host } = renderTimeline({
      annotations: [{ id: 'note', text: 'Saved note', anchor: { kind: 'point', time: 1 } }],
    });
    const header = host.querySelector<HTMLElement>('[data-review-header-track="source"]')!;
    expect(header.parentElement!.style.top).toBe('42px');
    expect(header.parentElement!.style.height).toBe('48px');
    expect(host.querySelector('[data-ui="gallery.videoReview.sourceLane"]')).not.toBeNull();
    expect(host.querySelector('[data-review-track="source"]')).not.toBeNull();
  } finally {
    rectangles.mockRestore();
  }
});
