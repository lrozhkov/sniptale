// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewTimeline } from './timeline';
import { layoutReviewActionLanes } from '../../features/video/review/action-lanes';
vi.mock('../../features/video/review/action-lanes', async (load) => {
  const original = await load<typeof import('../../features/video/review/action-lanes')>();
  return { ...original, layoutReviewActionLanes: vi.fn(original.layoutReviewActionLanes) };
});
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

it('hides technical cursor telemetry while preserving capture facts and mouse selection', async () => {
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
  expect(cursorButtons).toHaveLength(0);
  expect(host.querySelector('[data-history-family="cursor"]')).toBeNull();
  expect(props.markers).toEqual([action, ...cursors]);
  act(() =>
    host.querySelector<HTMLButtonElement>('[title^="gallery.videoReview.eventClick"]')!.click()
  );
  expect(props.onMarker).toHaveBeenCalledWith(action);
});

it('groups colliding actions within its populated lane without losing dense tail selection', async () => {
  const markers = [0, 1, 2, 3, 4].map((index) => ({
    ref: { kind: 'action' as const, id: `click${index}` },
    eventType: 'CLICK',
    start: 1 + index * 0.01,
    end: 1 + index * 0.01,
  }));
  const { host, props } = renderTimeline({ markers });
  const strip = host.querySelector<HTMLElement>(
    '[data-review-track="mouse"] [data-ui="gallery.videoReview.historyStrip"]'
  )!;
  // Dense events share one row; every group member remains selectable.
  expect(strip.style.height).toBe('28px');
  expect(strip.className).toContain('overflow-hidden');
  const markerButtons = [
    ...strip.querySelectorAll<HTMLButtonElement>('button[title^="gallery.videoReview.eventClick"]'),
  ];
  expect(markerButtons).toHaveLength(0);
  for (const button of markerButtons) expect(button.style.height).toBe('28px');
  const cluster = strip.querySelector<HTMLButtonElement>(
    '[data-ui="gallery.videoReview.historyCluster"] button'
  )!;
  await act(async () => cluster.click());
  const options = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')];
  expect(options).toHaveLength(5);
  await act(async () => options.at(-1)!.click());
  expect(props.onMarker).toHaveBeenCalledWith(markers.at(-1));
});

it('highlights only the explicitly selected action, independently of playback', () => {
  const markers = [
    { ref: { kind: 'action' as const, id: 'a' }, eventType: 'CLICK', start: 1, end: 1 },
    { ref: { kind: 'action' as const, id: 'b' }, eventType: 'SCROLL', start: 2, end: 2.5 },
  ];
  const { host } = renderTimeline({
    markers,
    time: 2.2,
    ...(markers[0] ? { selectedTelemetryRef: markers[0]!.ref } : {}),
  });
  const strip = host.querySelector(
    '[data-review-track="mouse"] [data-ui="gallery.videoReview.historyStrip"]'
  )!;
  const [selected, scrolled] = [...strip.querySelectorAll<HTMLButtonElement>('button')];
  expect(selected?.getAttribute('aria-pressed')).toBe('true');
  expect(selected?.className).toContain('review-timeline-item-selected');
  expect(selected?.className).not.toContain('bg-[var(--sniptale-color-accent');
  expect(selected?.className).toContain('review-interaction-item');
  expect(scrolled?.className).toContain('review-interaction-item');
  expect(scrolled?.getAttribute('aria-pressed')).toBe('false');
  expect(scrolled?.className).not.toContain('accent');
  expect(scrolled?.className).not.toContain('ring-');
});

it('retains event geometry across playback samples with a freeze and updates it after edits', () => {
  const marker = {
    ref: { kind: 'action' as const, id: 'click' },
    eventType: 'CLICK',
    start: 2,
    end: 2,
  };
  const freeze = {
    id: 'hold',
    kind: 'freeze' as const,
    start: 1,
    end: 1,
    requestedStart: 1,
    requestedEnd: 1,
    frameTime: 0.98,
    frameDuration: 0.04,
    duration: 2,
  };
  const { props, host } = renderTimeline({ markers: [marker], edits: [freeze], playing: true });
  const before = vi.mocked(layoutReviewActionLanes).mock.calls.length;
  for (const time of [2.1, 2.2, 2.3])
    act(() => environment.root!.render(<ReviewTimeline {...props} time={time} />));
  expect(layoutReviewActionLanes).toHaveBeenCalledTimes(before);
  const button = host.querySelector<HTMLButtonElement>(
    '[title^="gallery.videoReview.eventClick"]'
  )!;
  const position = button.style.left;
  act(() => button.click());
  expect(props.onMarker).toHaveBeenCalledWith(marker);
  act(() =>
    environment.root!.render(<ReviewTimeline {...props} edits={[{ ...freeze, duration: 4 }]} />)
  );
  expect(vi.mocked(layoutReviewActionLanes).mock.calls.length).toBeGreaterThan(before);
  expect(button.style.left).not.toBe(position);
});
