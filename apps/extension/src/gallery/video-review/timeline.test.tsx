// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReviewAnchor } from '../../features/video/review/types';
import { ReviewTimelineHoverGuide } from './timeline-hover';
import { ReviewTimeline } from './timeline';
import { useReviewTimelineGeometry } from './timeline-geometry';
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

type PlaneEvent = { type: string; x: number; button?: number };

it('shows hundredths in playback time with correct minute rollover', () => {
  const { host } = renderTimeline({ time: 59.999, duration: 72.345 });
  expect(host.querySelector('[data-toolbar-transport]')?.textContent).toContain(
    '1:00.00 / 1:12.35'
  );
});

it('keeps the transport icon-only and stable while its accessible Play/Pause action changes', () => {
  const { host, props } = renderTimeline();
  const play = host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.play"]')!;
  expect(play.title).toBe('gallery.videoReview.play');
  expect(play.textContent).toBe('');
  expect(play.querySelector('svg.lucide-play')).not.toBeNull();
  expect(play.getAttribute('data-review-toolbar-button')).toBeNull();
  act(() => play.click());
  expect(props.onPlay).toHaveBeenCalledOnce();
  renderTimeline({ playing: true });
  const pause = host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.pause"]')!;
  expect(pause.title).toBe('gallery.videoReview.pause');
  expect(pause.textContent).toBe('');
  expect(pause.querySelectorAll('svg rect')).toHaveLength(2);
  expect(pause.className).toBe(play.className);
});

it('navigates to kept source endpoints without changing selection or playback and reveals them when zoomed', () => {
  const selection: ReviewAnchor = { kind: 'range', start: 3, end: 5 };
  const edits = [
    { id: 'head', kind: 'cut' as const, start: 0, end: 2, requestedStart: 0, requestedEnd: 2 },
    { id: 'tail', kind: 'cut' as const, start: 8, end: 10, requestedStart: 8, requestedEnd: 10 },
  ];
  const { host, props } = renderTimeline({
    duration: 10,
    time: 2,
    edits,
    selection,
  });
  const start = host.querySelector<HTMLButtonElement>(
    '[aria-label="gallery.videoReview.timelineStart"]'
  )!;
  const end = host.querySelector<HTMLButtonElement>(
    '[aria-label="gallery.videoReview.timelineEnd"]'
  )!;
  const viewport = host.querySelector<HTMLElement>(
    '[data-ui="gallery.videoReview.timelineViewport"]'
  )!;
  expect(start.disabled).toBe(true);
  expect(end.disabled).toBe(false);
  expect(end.title).toBe('gallery.videoReview.timelineEnd');
  changeZoom(host, '50');
  act(() => end.click());
  expect(props.onSeek).toHaveBeenCalledExactlyOnceWith(8, false);
  expect(viewport.scrollLeft).toBeGreaterThan(0);
  expect(props.onSelect).not.toHaveBeenCalled();
  expect(props.onPlay).not.toHaveBeenCalled();
  renderTimeline({ duration: 10, time: 8, edits, selection });
  expect(end.disabled).toBe(true);
  act(() => start.click());
  expect(viewport.scrollLeft).toBe(0);
});

function planeWithMetrics(host: HTMLDivElement) {
  const plane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.timePlane"]')!;
  const gutter = Number.parseFloat(plane.style.getPropertyValue('--review-track-gutter'));
  vi.spyOn(plane, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(-gutter, 0, gutter + 400, 80)
  );
  Object.assign(plane, {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
  });
  return plane;
}

function dispatchPlane(plane: HTMLElement, events: PlaneEvent[]) {
  for (const event of events) {
    const target =
      event.type === 'pointerdown' && plane.dataset['ui'] === 'gallery.videoReview.timePlane'
        ? (plane.querySelector('[data-ui="gallery.videoReview.sourceLane"]') ?? plane)
        : plane;
    act(() =>
      target.dispatchEvent(
        new MouseEvent(event.type, {
          bubbles: true,
          button: event.button ?? 0,
          clientX: event.x,
        })
      )
    );
  }
}

function hoverAt(target: Element, x: number) {
  act(() => target.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: x })));
}

it('clears hover feedback on pointer leave and leaves disabled seeking neutral', () => {
  const { host } = renderTimeline({ busy: true });
  const plane = planeWithMetrics(host);
  hoverAt(host.querySelector('[data-ui="gallery.videoReview.sourceLane"]')!, 100);
  expect(plane.style.cursor).toBe('default');
  expect(host.querySelector('[data-ui="gallery.videoReview.hoverTime"]')).toBeNull();
  act(() => plane.dispatchEvent(new MouseEvent('pointerleave', { bubbles: true })));
  expect(host.querySelector('[data-ui="gallery.videoReview.hoverTime"]')).toBeNull();
});

it('keeps a usable ruler width while track labels and viewport are temporarily unmeasurable', () => {
  let measure = () => {};
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        measure = () => callback([], this as ResizeObserver);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  const { host } = renderTimeline();
  host.querySelector('[data-track-label]')?.remove();
  host.querySelector('[data-track-controls]')?.remove();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(0);
  act(() => measure());
  const plane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.timePlane"]')!;
  expect(plane.style.getPropertyValue('--review-track-gutter')).toBe('0px');
  expect(plane.querySelector('[data-ui="gallery.videoReview.ruler"]')).not.toBeNull();
});

it('does not observe geometry before the viewport mounts', () => {
  function DetachedGeometry() {
    useReviewTimelineGeometry();
    return null;
  }
  act(() => environment.root!.render(<DetachedGeometry />));
  expect(environment.host!.childElementCount).toBe(0);
});

it('previews the boundary that basic cut drawing will select', () => {
  const { host } = renderTimeline({
    sourceRangeTool: true,
    snapRangePreview: true,
    boundaries: [0, 1, 2, 3, 4],
  });
  const plane = planeWithMetrics(host);
  hoverAt(host.querySelector('[data-ui="gallery.videoReview.sourceLane"]')!, 137);
  const guide = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.hoverTime"]')!;
  expect(guide.dataset['snapped']).toBe('true');
  expect(guide.textContent).toBe('1.0');
  expect(guide.style.left).toBe(
    `${100 + Number.parseFloat(plane.style.getPropertyValue('--review-track-gutter'))}px`
  );
});

it('keeps the seek cursor during plane capture from an audio lane', () => {
  const { host } = renderTimeline({
    audioTracks: { originalAudio: <div data-ui="gallery.videoReview.audioLane" /> },
  });
  const plane = planeWithMetrics(host);
  const audio = host.querySelector('[data-ui="gallery.videoReview.audioLane"]')!;
  act(() => audio.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 100 })));
  hoverAt(plane, 200);
  expect(plane.style.cursor).toBe('default');
  expect(host.querySelector('[data-ui="gallery.videoReview.hoverTime"]')?.textContent).toBe('2.0');
  dispatchPlane(plane, [{ type: 'pointerup', x: 200 }]);
});

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
  changeZoom(host, '25');
  expect(
    host.querySelector('[aria-label="gallery.videoReview.position"]')?.getAttribute('aria-valuemax')
  ).toBe('4');
  const plane = planeWithMetrics(host);
  dispatchPlane(plane, [{ type: 'pointerdown', x: 300 }]);
  expect(props.onSeek).toHaveBeenCalledWith(3);
  expect(props.onSelect).toHaveBeenCalledWith({ kind: 'point', time: 3 });
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[title="gallery.videoReview.eventClick · 1.0–1.1"]')!
      .click()
  );
  expect(props.onMarker).toHaveBeenCalledWith(marker);
  act(() => host.querySelector<HTMLButtonElement>('[title="Comment"]')!.click());
  expect(props.onComment).toHaveBeenCalledWith(annotation);
});

it('commits a range from a drag and restores the previous state through Escape', () => {
  const onRangeCommit = vi.fn();
  const selection: ReviewAnchor = { kind: 'range', start: 1, end: 3 };
  const { host, props } = renderTimeline({ selection, onRangeCommit, sourceRangeTool: true });
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
  expect(props.onSeek).toHaveBeenCalledTimes(2);
  expect(props.onSeek).toHaveBeenLastCalledWith(2, false);
});

it('exposes transport, continuous zoom and fit without a volume control', () => {
  const edits = [
    { id: 'c', kind: 'cut' as const, start: 2, end: 3, requestedStart: 2, requestedEnd: 3 },
  ];
  const { host, props } = renderTimeline({ edits });
  act(() =>
    host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.play"]')!.click()
  );
  expect(props.onPlay).toHaveBeenCalled();
  expect(
    host.querySelector('output[title="gallery.videoReview.resultDuration"]')?.textContent
  ).toBe('→ 3.0');
  expect(host.querySelector('[aria-label="gallery.videoReview.volume"]')).toBeNull();
  expect(
    host
      .querySelector<HTMLElement>('[aria-label="videoEditor.timeline.zoom"]')!
      .style.getPropertyValue('--sniptale-color-accent')
  ).toBe('var(--sniptale-color-text-dim)');
  changeZoom(host, '25');
  act(() =>
    host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.fit"]')!.click()
  );
  expect(
    host.querySelector<HTMLInputElement>('[aria-label="videoEditor.timeline.zoom"]')!.value
  ).toBe('0');
});

it('marks the selected source edit while preserving neutral surfaces', () => {
  const edits = [
    { id: 'cut', kind: 'cut' as const, start: 1, end: 2, requestedStart: 1, requestedEnd: 2 },
    {
      id: 'speed',
      kind: 'speed' as const,
      start: 2,
      end: 3,
      requestedStart: 2,
      requestedEnd: 3,
      rate: 2 as const,
      audio: 'mute' as const,
    },
  ];
  const { host } = renderTimeline({
    edits,
    selectedEditId: 'speed',
    selection: { kind: 'range', start: 2, end: 3 },
  });
  const blocks = host.querySelectorAll<HTMLElement>('[data-ui="gallery.videoReview.editBlock"]');
  expect(blocks[0]!.querySelector('button')!.getAttribute('aria-pressed')).toBe('false');
  expect(blocks[1]!.querySelector('button')!.getAttribute('aria-pressed')).toBe('true');
  expect(blocks[1]!.className).toContain('border-[var(--sniptale-color-accent)]');
  expect(blocks[0]!.className).toContain('var(--sniptale-color-danger)_12%');
  expect(blocks[1]!.className).toContain('var(--sniptale-color-info)_12%');
  expect(host.querySelector('[data-ui="gallery.videoReview.sourceRange"]')).toBeNull();
});

it('renders ruler labels at the unit chosen for the current scale', () => {
  const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  try {
    const { host } = renderTimeline();
    const ruler = host.querySelector('[data-ui="gallery.videoReview.ruler"]')!;
    expect(ruler.querySelectorAll('span').length).toBeGreaterThan(0);
    expect([...ruler.querySelectorAll('span')].map((node) => node.textContent)).toEqual([
      '0.0',
      '0.5',
      '1.0',
      '1.5',
      '2.0',
      '2.5',
      '3.0',
      '3.5',
      '4.0',
    ]);
  } finally {
    clientWidth.mockRestore();
  }
});

it('sizes the separate label pane from natural label and control widths without a resize handle', () => {
  const metric = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (
    this: HTMLElement
  ) {
    return this.hasAttribute('data-track-label')
      ? 130
      : this.hasAttribute('data-track-controls')
        ? 64
        : 0;
  });
  try {
    const { host, props } = renderTimeline();
    const panes = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.timelinePanes"]')!;
    expect(panes.style.getPropertyValue('--review-label-width')).toBe('238px');
    expect(host.querySelector('[role="separator"]')).toBeNull();
    expect(props.onSeek).not.toHaveBeenCalled();
  } finally {
    metric.mockRestore();
  }
});

it('keeps the whole playhead inside the plane at the final frame', () => {
  const { host } = renderTimeline({ time: 4 });
  const plane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.timePlane"]')!;
  const playhead = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.playhead"]')!;
  const viewport = host.querySelector<HTMLElement>(
    '[data-ui="gallery.videoReview.timelineViewport"]'
  )!;
  expect(plane.style.width).toBe('100%');
  expect(Number.parseFloat(playhead.style.left)).toBeLessThan(viewport.clientWidth);
  expect(playhead.style.clipPath).toBeTruthy();
});

function changeZoom(host: HTMLElement, value: string) {
  const slider = host.querySelector<HTMLInputElement>('[aria-label="videoEditor.timeline.zoom"]')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(slider, value);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it('clears object selection on empty source-lane seek, leaving interactive action clicks alone', () => {
  const clear = vi.fn();
  const { host } = renderTimeline({ onClearSelection: clear });
  const plane = planeWithMetrics(host);
  dispatchPlane(plane, [
    { type: 'pointerdown', x: 300 },
    { type: 'pointerup', x: 300 },
  ]);
  expect(clear).toHaveBeenCalledTimes(1);
});

it('allows seeking while writes lock track editing, without creating a new range', () => {
  const { props, host } = renderTimeline({ busy: true });
  const plane = planeWithMetrics(host);
  expect(plane.hasAttribute('inert')).toBe(false);
  expect(
    host.querySelector('[data-ui="gallery.videoReview.sourceLane"]')?.closest('[inert]')
  ).not.toBeNull();
  dispatchPlane(plane, [
    { type: 'pointerdown', x: 300 },
    { type: 'pointermove', x: 350 },
    { type: 'pointerup', x: 350 },
  ]);
  expect(props.onSeek).toHaveBeenCalledWith(3, false);
  expect(props.onSelect).not.toHaveBeenCalled();
});

it.each(['zoomLane', 'audioLane'])('seeks without selecting a range on an idle %s', (laneName) => {
  const onRangeCommit = vi.fn();
  const { host, props } = renderTimeline({
    onRangeCommit,
    zoomTrack: <div data-ui={`gallery.videoReview.${laneName}`} />,
  });
  const plane = planeWithMetrics(host);
  const lane = host.querySelector<HTMLElement>(`[data-ui="gallery.videoReview.${laneName}"]`)!;
  dispatchPlane(lane, [{ type: 'pointerdown', x: 100 }]);
  dispatchPlane(plane, [
    { type: 'pointermove', x: 250 },
    { type: 'pointerup', x: 250 },
  ]);
  expect(props.onSeek).toHaveBeenCalledWith(1);
  expect(props.onSelect).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'range' }));
  expect(onRangeCommit).not.toHaveBeenCalled();
});

it('routes focus drawing to its own tool and cancels without committing', () => {
  const onFocusRangeCommit = vi.fn();
  const onRangeCommit = vi.fn();
  const onFocusRangePreview = vi.fn();
  const { host, props } = renderTimeline({
    onFocusRangeCommit,
    onFocusRangePreview,
    onRangeCommit,
    zoomTrack: <div data-ui="gallery.videoReview.zoomLane" />,
  });
  const plane = planeWithMetrics(host);
  const lane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.zoomLane"]')!;
  dispatchPlane(lane, [{ type: 'pointerdown', x: 250 }]);
  dispatchPlane(plane, [
    { type: 'pointermove', x: 100 },
    { type: 'pointerup', x: 100 },
  ]);
  expect(onFocusRangeCommit).toHaveBeenCalledExactlyOnceWith({ kind: 'range', start: 1, end: 2.5 });
  expect(onRangeCommit).not.toHaveBeenCalled();
  expect(onFocusRangePreview).toHaveBeenCalledWith({ kind: 'range', start: 1, end: 2.5 });
  expect(onFocusRangePreview).toHaveBeenLastCalledWith(null);
  expect(props.onSelect).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'range' }));
  dispatchPlane(lane, [{ type: 'pointerdown', x: 250 }]);
  dispatchPlane(plane, [{ type: 'pointermove', x: 100 }]);
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  dispatchPlane(plane, [{ type: 'pointerup', x: 100 }]);
  expect(onFocusRangeCommit).toHaveBeenCalledTimes(1);
  expect(onFocusRangePreview).toHaveBeenLastCalledWith(null);
});

it('fits the time plane to live CSS width without a resize-observer frame of overflow', () => {
  const { host } = renderTimeline();
  const viewport = host.querySelector<HTMLElement>(
    '[data-ui="gallery.videoReview.timelineViewport"]'
  )!;
  const plane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.timePlane"]')!;
  expect(plane.style.width).toBe('100%');
  expect(viewport.style.overflowX).toBe('hidden');
});

it('keeps export before More and available while timeline edits are busy', async () => {
  const onOpenExport = vi.fn();
  renderTimeline({ busy: true, onOpenExport });
  const buttons = environment.host!.querySelectorAll<HTMLButtonElement>(
    '[data-ui="gallery.videoReview.toolbar"] button'
  );
  expect(buttons[buttons.length - 1]!.getAttribute('aria-label')).toBe(
    'gallery.videoReview.moreActions'
  );
  const opener = buttons[buttons.length - 2]!;
  expect(opener.getAttribute('aria-label')).toBe('gallery.videoReview.exportSection');
  expect(opener.getAttribute('title')).toBe('gallery.videoReview.exportSection');
  expect(opener.previousElementSibling?.getAttribute('data-ui')).toBe(
    'gallery.videoReview.toolbar.separator'
  );
  expect(opener.disabled).toBe(false);
  await act(async () => opener.click());
  expect(onOpenExport).toHaveBeenCalledOnce();
});

it('cancels focus capture and preview when the drawing capability changes', () => {
  const preview = vi.fn(),
    commit = vi.fn();
  const { host, props } = renderTimeline({
    onFocusRangeCommit: commit,
    onFocusRangePreview: preview,
    zoomTrack: <div data-ui="gallery.videoReview.zoomLane" />,
  });
  const plane = planeWithMetrics(host);
  const focus = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.zoomLane"]')!;
  dispatchPlane(focus, [
    { type: 'pointerdown', x: 100 },
    { type: 'pointermove', x: 250 },
  ]);
  expect(preview).toHaveBeenCalledWith({ kind: 'range', start: 1, end: 2.5 });
  renderTimeline({ ...props, onFocusRangeCommit: undefined, originalRangeTool: true });
  dispatchPlane(plane, [{ type: 'pointerup', x: 250 }]);
  expect(preview).toHaveBeenLastCalledWith(null);
  expect(commit).not.toHaveBeenCalled();
  expect(plane.releasePointerCapture).toHaveBeenCalled();
});

it('centers the source playhead through repeated zoom changes without seeking or selecting', () => {
  const { host, props } = renderTimeline({ duration: 10, time: 7 });
  const viewport = host.querySelector<HTMLElement>(
    '[data-ui="gallery.videoReview.timelineViewport"]'
  )!;
  const plane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.timePlane"]')!;
  const gutter = Number.parseFloat(plane.style.getPropertyValue('--review-track-gutter'));
  const width = viewport.clientWidth - gutter;
  for (const slider of [25, 50, 75, 40, 0]) {
    changeZoom(host, String(slider));
    const zoom = 2 ** (slider / 25);
    const expected = Math.max(0, Math.min(width * (zoom - 1), width * zoom * 0.7 - width / 2));
    expect(viewport.scrollLeft).toBeCloseTo(expected);
  }
  expect(props.onSeek).not.toHaveBeenCalled();
  expect(props.onSelect).not.toHaveBeenCalled();
});

it.each([0, 1, 5, 9, 10])(
  'centers or clamps selected source anchor %s even with playhead at start',
  (anchor) => {
    const { host, props } = renderTimeline({ duration: 10, time: 0, zoomAnchor: anchor });
    const viewport = host.querySelector<HTMLElement>(
      '[data-ui="gallery.videoReview.timelineViewport"]'
    )!;
    const plane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.timePlane"]')!;
    const width =
      viewport.clientWidth -
      Number.parseFloat(plane.style.getPropertyValue('--review-track-gutter'));
    for (const value of [25, 50, 75]) {
      changeZoom(host, String(value));
      const zoom = 2 ** (value / 25);
      expect(viewport.scrollLeft).toBeCloseTo(
        Math.max(0, Math.min(width * (zoom - 1), (anchor / 10) * width * zoom - width / 2))
      );
    }
    expect(props.onSeek).not.toHaveBeenCalled();
    expect(props.onSelect).not.toHaveBeenCalled();
  }
);

it('defers zoom and its scroll change until the existing before-action gate accepts', () => {
  let accept: (() => void) | undefined;
  const { host, props } = renderTimeline({
    duration: 10,
    time: 7,
    beforeAction: (action) => {
      accept = action;
    },
  });
  const viewport = host.querySelector<HTMLElement>(
    '[data-ui="gallery.videoReview.timelineViewport"]'
  )!;
  changeZoom(host, '50');
  expect(viewport.scrollLeft).toBe(0);
  expect(accept).toBeDefined();
  act(() => accept?.());
  expect(viewport.scrollLeft).toBeGreaterThan(0);
  expect(props.onSeek).not.toHaveBeenCalled();
});

it('zooms with normalized wheel input, clamps the thumb and contains handled gestures', () => {
  const { host, props } = renderTimeline();
  const slider = host.querySelector<HTMLInputElement>('[aria-label="videoEditor.timeline.zoom"]')!;
  const parentWheel = vi.fn();
  host.addEventListener('wheel', parentWheel);
  const wheel = (options: WheelEventInit) => {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...options });
    act(() => slider.dispatchEvent(event));
    return event;
  };
  expect(wheel({ deltaY: -100 }).defaultPrevented).toBe(true);
  expect(slider.valueAsNumber).toBeCloseTo(5);
  expect(wheel({ deltaY: 1, deltaMode: 1 }).defaultPrevented).toBe(true);
  expect(slider.valueAsNumber).toBeCloseTo(3);
  wheel({ deltaY: 1, deltaMode: 2 });
  expect(slider.valueAsNumber).toBeCloseTo(0);
  expect(wheel({ deltaY: 100 }).defaultPrevented).toBe(true);
  expect(slider.valueAsNumber).toBeCloseTo(0);
  changeZoom(host, '100');
  expect(wheel({ deltaY: -100 }).defaultPrevented).toBe(true);
  expect(slider.valueAsNumber).toBeCloseTo(100);
  expect(parentWheel).not.toHaveBeenCalled();
  expect(wheel({ deltaY: -100, ctrlKey: true }).defaultPrevented).toBe(true);
  expect(wheel({ deltaY: 0 }).defaultPrevented).toBe(false);
  wheel({ deltaX: 20 });
  expect(slider.valueAsNumber).toBeCloseTo(99);
  expect(props.onSeek).not.toHaveBeenCalled();
  act(() => environment.root!.render(null));
  expect(wheel({ deltaY: -100 }).defaultPrevented).toBe(false);
});

it('admits wheel zoom through the existing pending-note gate', () => {
  let accept: (() => void) | undefined;
  const { host } = renderTimeline({
    beforeAction: (action) => {
      accept = action;
    },
  });
  const slider = host.querySelector<HTMLInputElement>('[aria-label="videoEditor.timeline.zoom"]')!;
  act(() =>
    slider.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }))
  );
  expect(slider.valueAsNumber).toBeCloseTo(0);
  expect(accept).toBeDefined();
  act(() => accept?.());
  expect(slider.valueAsNumber).toBeCloseTo(5);
});

it('blocks playback while an export transaction owns the busy timeline', () => {
  const { host, props } = renderTimeline({ busy: true });
  const play = host.querySelector<HTMLButtonElement>(
    'button[aria-label="gallery.videoReview.play"]'
  )!;
  expect(play.disabled).toBe(true);
  act(() => play.click());
  expect(props.onPlay).not.toHaveBeenCalled();
});

it('owns Ctrl+wheel throughout the timeline without changing playback or ordinary scrolling', () => {
  const { host, props } = renderTimeline();
  const timeline = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.timeline"]')!;
  const viewport = host.querySelector<HTMLElement>(
    '[data-ui="gallery.videoReview.timelineViewport"]'
  )!;
  const slider = host.querySelector<HTMLInputElement>('[aria-label="videoEditor.timeline.zoom"]')!;
  const parentWheel = vi.fn();
  host.addEventListener('wheel', parentWheel);
  const wheel = (target: Element, options: WheelEventInit) => {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...options });
    act(() => target.dispatchEvent(event));
    return event;
  };
  expect(wheel(viewport, { ctrlKey: true, deltaY: -100 }).defaultPrevented).toBe(true);
  expect(slider.valueAsNumber).toBeCloseTo(5);
  expect(wheel(timeline, { ctrlKey: true, deltaY: 1, deltaMode: 1 }).defaultPrevented).toBe(true);
  expect(slider.valueAsNumber).toBeCloseTo(3);
  wheel(slider, { ctrlKey: true, deltaY: 1, deltaMode: 2 });
  expect(slider.valueAsNumber).toBe(0);
  expect(wheel(viewport, { ctrlKey: true, deltaY: 100 }).defaultPrevented).toBe(true);
  expect(parentWheel).not.toHaveBeenCalled();
  expect(wheel(viewport, { deltaY: -100 }).defaultPrevented).toBe(false);
  expect(wheel(viewport, { ctrlKey: true, deltaY: 0 }).defaultPrevented).toBe(false);
  expect(wheel(viewport, { ctrlKey: true, metaKey: true, deltaY: -100 }).defaultPrevented).toBe(
    false
  );
  expect(slider.valueAsNumber).toBe(0);
  expect(props.onSeek).not.toHaveBeenCalled();
  expect(props.onSelect).not.toHaveBeenCalled();
  act(() => environment.root!.render(null));
  expect(wheel(timeline, { ctrlKey: true, deltaY: -100 }).defaultPrevented).toBe(false);
});

it('defers Ctrl+wheel zoom until the pending-note gate accepts', () => {
  let accept: (() => void) | undefined;
  const { host } = renderTimeline({
    beforeAction: (action) => {
      accept = action;
    },
  });
  const viewport = host.querySelector<HTMLElement>(
    '[data-ui="gallery.videoReview.timelineViewport"]'
  )!;
  const slider = host.querySelector<HTMLInputElement>('[aria-label="videoEditor.timeline.zoom"]')!;
  const event = new WheelEvent('wheel', {
    ctrlKey: true,
    deltaY: -100,
    bubbles: true,
    cancelable: true,
  });
  act(() => viewport.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  expect(slider.valueAsNumber).toBe(0);
  expect(accept).toBeDefined();
  act(() => accept?.());
  expect(slider.valueAsNumber).toBeCloseTo(5);
});

it('keeps a separate ruler marker aligned with the scrolling source playhead', () => {
  const { host } = renderTimeline({ time: 1.5, duration: 4 });
  const ruler = host.querySelector('[data-ui="gallery.videoReview.rulerRow"]')!;
  const cap = ruler.querySelector<HTMLElement>('[data-ui="gallery.videoReview.rulerPlayhead"]')!;
  const head = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.playhead"]')!;
  expect(cap.style.left).toBe(head.style.left);
  renderTimeline({ time: 3, duration: 4 });
  expect(cap.style.left).toBe(head.style.left);
  expect(ruler.contains(head)).toBe(false);
});

it('retains timeline keyboard focus when a committed row becomes inert', () => {
  const zoomTrack = (
    <div>
      <input aria-label="Child value" />
      <button type="button">Child command</button>
    </div>
  );
  const { host } = renderTimeline({ zoomTrack });
  document.body.appendChild(host);
  const plane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.timePlane"]')!;
  const field = host.querySelector<HTMLInputElement>('[aria-label="Child value"]')!;
  const command = Array.from(host.querySelectorAll('button')).find(
    (node) => node.textContent === 'Child command'
  )!;
  const external = document.createElement('button');
  document.body.appendChild(external);
  try {
    for (const target of [field, command]) {
      renderTimeline({ zoomTrack, busy: false });
      target.focus();
      expect(document.activeElement).toBe(target);
      renderTimeline({ zoomTrack, busy: true });
      // jsdom does not implement the native blur caused by an inert ancestor.
      act(() => target.blur());
      expect(document.activeElement).toBe(plane);
    }
    renderTimeline({ zoomTrack, busy: false });
    field.focus();
    act(() => field.blur());
    expect(document.activeElement).toBe(document.body);
    field.focus();
    renderTimeline({ zoomTrack, busy: true });
    act(() => external.focus());
    expect(document.activeElement).toBe(external);
  } finally {
    external.remove();
    host.remove();
  }
});

it('moves the time label away from the cursor while retaining the visible ruler bounds', () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 70, 18)
  );
  const viewport = document.createElement('div');
  const render = (x: number, pointerY: number) =>
    act(() =>
      environment.root!.render(
        <ReviewTimelineHoverGuide
          viewport={{ current: viewport }}
          gutter={100}
          width={700}
          hover={{ x, time: 2, snapped: false, lane: 'ruler', pointerX: x, pointerY }}
        />
      )
    );
  const offset = () => environment.host!.querySelector('span')!.style.transform;
  render(300, 12);
  expect(offset()).toBe('translateX(-78px)');
  render(300, 80);
  expect(offset()).toBe('translateX(4px)');
  render(101, 12);
  expect(offset()).toBe('translateX(32px)');
});
