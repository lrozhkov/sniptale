// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewTimeline } from './timeline';
import { ReviewTrackRow } from './track-row';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let host: HTMLDivElement;
let root: Root;

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
  host = document.createElement('div');
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
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
  act(() => root.render(<ReviewTimeline {...props} />));
  return { props, host };
}

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

function dispatchPlane(target: HTMLElement, events: { type: string; x: number }[]) {
  for (const event of events)
    act(() =>
      target.dispatchEvent(
        new MouseEvent(event.type, { bubbles: true, button: 0, clientX: event.x })
      )
    );
}

function hoverAt(target: Element, x: number) {
  act(() => target.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: x })));
}

function changeZoom(host: HTMLElement, value: string) {
  const slider = host.querySelector<HTMLInputElement>('[aria-label="videoEditor.timeline.zoom"]')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(slider, value);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it('shows an exact range-start guide only over drawing zones, with neutral seek and control cursors', () => {
  const { host, props } = renderTimeline({
    originalRangeTool: true,
    zoomTrack: <div data-ui="gallery.videoReview.zoomLane" />,
    audioTrack: (
      <>
        <div data-ui="gallery.videoReview.audioLane" data-original-audio-lane />
        <div data-ui="gallery.videoReview.audioLane" />
      </>
    ),
  });
  const plane = planeWithMetrics(host);
  const source = host.querySelector('[data-ui="gallery.videoReview.sourceLane"]')!;
  hoverAt(source, 100);
  expect(plane.style.cursor).toBe('default');
  expect(host.querySelector('[data-ui="gallery.videoReview.hoverTime"]')?.textContent).toBe('1.0');
  expect(
    (host.querySelector('[data-ui="gallery.videoReview.hoverTime"]') as HTMLElement).style.left
  ).toBe(`${100 + Number.parseFloat(plane.style.getPropertyValue('--review-track-gutter'))}px`);
  renderTimeline({ ...props, onFocusRangeCommit: vi.fn(), originalRangeTool: false });
  hoverAt(host.querySelector('[data-ui="gallery.videoReview.zoomLane"]')!, 200);
  expect(plane.style.cursor).toContain('4 16, cell');
  renderTimeline({ ...props, originalRangeTool: true });
  hoverAt(host.querySelector('[data-original-audio-lane]')!, 200);
  expect(plane.style.cursor).toContain('4 16, cell');
  hoverAt(
    host.querySelector(
      '[data-ui="gallery.videoReview.audioLane"]:not([data-original-audio-lane])'
    )!,
    200
  );
  expect(plane.style.cursor).toBe('default');
  hoverAt(host.querySelector('[data-ui="gallery.videoReview.trackHeader"]')!, 200);
  expect(host.querySelector('[data-ui="gallery.videoReview.hoverTime"]')).toBeNull();
});

it('shows the focus cursor on a lane descendant but clears it over row padding and gaps', () => {
  const { host } = renderTimeline({
    onFocusRangeCommit: vi.fn(),
    zoomTrack: (
      <ReviewTrackRow label="Focus">
        <div data-ui="gallery.videoReview.zoomLane" className="mt-1 h-8">
          <span data-ui="focus-lane-child" />
        </div>
      </ReviewTrackRow>
    ),
  });
  const plane = planeWithMetrics(host);
  hoverAt(host.querySelector('[data-ui="focus-lane-child"]')!, 180);
  expect(plane.style.cursor).toContain('4 16, cell');
  const rowPadding = host.querySelector('[data-ui="gallery.videoReview.zoomLane"]')?.parentElement;
  hoverAt(rowPadding!, 180);
  expect(plane.style.cursor).toBe('default');
  expect(host.querySelector('[data-ui="gallery.videoReview.hoverTime"]')).toBeNull();
  hoverAt(host.querySelector('[data-ui="focus-lane-child"]')!, 180);
  expect(plane.style.cursor).toContain('4 16, cell');
  hoverAt(plane, 180);
  expect(plane.style.cursor).toBe('default');
  expect(host.querySelector('[data-ui="gallery.videoReview.hoverTime"]')).toBeNull();
});

it('leaves selection, seeking and pointer capture untouched when a gesture starts in a row gap', () => {
  const onClearSelection = vi.fn();
  const onRangeCommit = vi.fn();
  const { host, props } = renderTimeline({ onClearSelection, onRangeCommit });
  const plane = planeWithMetrics(host);
  const gap = host.querySelector('[data-ui="gallery.videoReview.sourceLane"]')?.parentElement;
  dispatchPlane(gap as HTMLElement, [{ type: 'pointerdown', x: 180 }]);
  dispatchPlane(plane, [
    { type: 'pointermove', x: 240 },
    { type: 'pointerup', x: 240 },
  ]);
  expect(props.onSeek).not.toHaveBeenCalled();
  expect(props.onSelect).not.toHaveBeenCalled();
  expect(onClearSelection).not.toHaveBeenCalled();
  expect(onRangeCommit).not.toHaveBeenCalled();
  expect(plane.setPointerCapture).not.toHaveBeenCalled();
});

it('clears range hover before original audio takes local pointer capture', () => {
  const localDown = vi.fn((event: React.PointerEvent) => event.stopPropagation());
  const { host } = renderTimeline({
    originalRangeTool: true,
    audioTrack: (
      <ReviewTrackRow label="Original audio">
        <div
          data-ui="gallery.videoReview.audioLane"
          data-original-audio-lane
          onPointerDown={localDown}
        />
      </ReviewTrackRow>
    ),
  });
  const plane = planeWithMetrics(host);
  const lane = host.querySelector('[data-original-audio-lane]')!;
  hoverAt(lane, 180);
  expect(plane.style.cursor).toContain('4 16, cell');
  dispatchPlane(lane as HTMLElement, [{ type: 'pointerdown', x: 180 }]);
  expect(localDown).toHaveBeenCalledOnce();
  expect(plane.style.cursor).toBe('default');
  expect(host.querySelector('[data-ui="gallery.videoReview.hoverTime"]')).toBeNull();
});

it('keeps the ruler usable while existing edit bodies and trim handles take cursor priority', () => {
  const onRangeCommit = vi.fn();
  const { host, props } = renderTimeline({
    edits: [{ id: 'cut-1', kind: 'cut', start: 1, end: 2, requestedStart: 1, requestedEnd: 2 }],
    onRangeCommit,
  });
  const plane = planeWithMetrics(host);
  const edit = host.querySelector('[data-ui="gallery.videoReview.editBlock"]')!;
  const handle = edit.querySelector('[data-edge="start"]')!;
  expect(edit.querySelector('button:not([data-edge])')?.className).toContain('cursor-grab');
  expect(handle.className).toContain('cursor-ew-resize');
  hoverAt(edit, 150);
  expect(plane.style.cursor).toBe('default');
  hoverAt(handle, 150);
  expect(plane.style.cursor).toBe('default');
  expect(host.querySelector('[data-ui="gallery.videoReview.hoverTime"]')).toBeNull();
  const ruler = host.querySelector('[data-ui="gallery.videoReview.ruler"]')!;
  hoverAt(ruler, 180);
  expect(plane.style.cursor).toContain('4 16, cell');
  dispatchPlane(ruler as HTMLElement, [{ type: 'pointerdown', x: 100 }]);
  dispatchPlane(plane, [
    { type: 'pointermove', x: 180 },
    { type: 'pointerup', x: 180 },
  ]);
  expect(props.onSelect).toHaveBeenCalledWith({ kind: 'range', start: 1, end: 1.8 });
  expect(onRangeCommit).toHaveBeenCalledOnce();
});

it('clears lane hover when the timeline scrolls or zoom changes', () => {
  const { host } = renderTimeline();
  const plane = planeWithMetrics(host);
  const source = host.querySelector('[data-ui="gallery.videoReview.sourceLane"]')!;
  hoverAt(source, 180);
  expect(host.querySelector('[data-ui="gallery.videoReview.hoverTime"]')).not.toBeNull();
  act(() =>
    host
      .querySelector('[data-ui="gallery.videoReview.timelineViewport"]')!
      .dispatchEvent(new Event('scroll', { bubbles: true }))
  );
  expect(plane.style.cursor).toBe('default');
  hoverAt(source, 180);
  changeZoom(host, '25');
  expect(plane.style.cursor).toBe('default');
  expect(host.querySelector('[data-ui="gallery.videoReview.hoverTime"]')).toBeNull();
});

it('keeps source and ruler neutral while the focus drawing tool owns range selection', () => {
  const onFocusRangeCommit = vi.fn();
  const onRangeCommit = vi.fn();
  const { props, host } = renderTimeline({
    onFocusRangeCommit,
    onRangeCommit,
    zoomTrack: <div data-ui="gallery.videoReview.zoomLane" />,
  });
  const plane = planeWithMetrics(host);
  for (const selector of ['sourceLane', 'ruler']) {
    const target = host.querySelector<HTMLElement>(`[data-ui="gallery.videoReview.${selector}"]`)!;
    hoverAt(target, 100);
    expect(plane.style.cursor).toBe('default');
    dispatchPlane(target, [
      { type: 'pointerdown', x: 100 },
      { type: 'pointermove', x: 250 },
      { type: 'pointerup', x: 250 },
    ]);
    expect(props.onSelect).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'range' }));
    expect(onRangeCommit).not.toHaveBeenCalled();
    expect(onFocusRangeCommit).not.toHaveBeenCalled();
  }
});

it('rejects source-range gestures and existing source edit keyboard actions in Focus mode', () => {
  const onChangeEdit = vi.fn();
  const onEdit = vi.fn();
  const onRangeCommit = vi.fn();
  const { props, host } = renderTimeline({
    onFocusRangeCommit: vi.fn(),
    onRangeCommit,
    onChangeEdit,
    onEdit,
    edits: [{ id: 'cut-a', kind: 'cut', start: 1, end: 2, requestedStart: 1, requestedEnd: 2 }],
  });
  planeWithMetrics(host);
  const source = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.sourceLane"]')!;
  dispatchPlane(source, [
    { type: 'pointerdown', x: 100 },
    { type: 'pointermove', x: 250 },
    { type: 'pointerup', x: 250 },
  ]);
  expect(props.onSelect).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'range' }));
  expect(onRangeCommit).not.toHaveBeenCalled();
  const block = source.querySelector<HTMLElement>('[data-ui="gallery.videoReview.editBlock"]')!;
  const edge = block.querySelector<HTMLButtonElement>('[data-edge="start"]')!;
  act(() => edge.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  act(() => block.querySelector<HTMLButtonElement>('button')!.click());
  expect(onChangeEdit).not.toHaveBeenCalled();
  expect(onEdit).not.toHaveBeenCalled();
  renderTimeline({ ...props, onFocusRangeCommit: undefined });
  expect(edge.disabled).toBe(false);
  act(() => edge.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  act(() => block.querySelector<HTMLButtonElement>('button')!.click());
  expect(onChangeEdit).toHaveBeenCalledOnce();
  expect(onEdit).toHaveBeenCalledOnce();
});

it('keeps source video and ruler out of original gain drawing and uses seek cursors', () => {
  const onRangeCommit = vi.fn();
  const { host, props } = renderTimeline({ originalRangeTool: true, onRangeCommit });
  const plane = planeWithMetrics(host);
  for (const selector of ['sourceLane', 'ruler']) {
    const target = host.querySelector<HTMLElement>(`[data-ui="gallery.videoReview.${selector}"]`)!;
    hoverAt(target, 100);
    expect(plane.style.cursor).toBe('default');
    dispatchPlane(target, [
      { type: 'pointerdown', x: 100 },
      { type: 'pointermove', x: 250 },
      { type: 'pointerup', x: 250 },
    ]);
    expect(props.onSelect).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'range' }));
    expect(onRangeCommit).not.toHaveBeenCalled();
  }
});
