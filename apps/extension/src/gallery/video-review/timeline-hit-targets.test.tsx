// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewTimeline } from './timeline';
import { ReviewTrackRow } from './track-row';
import { ReviewTextTrack } from './original-speech-track';
import { useReviewText } from './use-review-text';
import { ReviewAnnotationEffectsTrack } from './annotation-effects-track';

function ActualTextLane({ selected }: { selected(id: string): void }) {
  const editor = useReviewText({
    document: {
      version: 1,
      fragments: [
        {
          id: 'text',
          start: 1,
          end: 2,
          text: 'Recorded text',
          originalText: '',
          timeDomain: 'source',
          revision: 0,
          timingRevision: 0,
          alignment: 'manual',
          showInVideo: true,
        },
      ],
    },
    sourceDuration: 4,
    sourceTime: 0,
    edits: [],
    setText: vi.fn(),
    select: vi.fn(),
    seek: vi.fn(),
    pause: vi.fn(),
  });
  return (
    <ReviewTextTrack editor={editor} busy={false} onSelect={selected} onOpenDocument={vi.fn()} />
  );
}

function ActualAnnotationLane() {
  return (
    <ReviewAnnotationEffectsTrack
      instances={[]}
      snapshots={[]}
      duration={4}
      time={0}
      enabled
      busy={false}
      selectedId={null}
      snapTimes={[]}
      onEnabled={vi.fn()}
      onSelect={vi.fn()}
      onBegin={vi.fn(() => true)}
      onPreview={vi.fn()}
      onCommit={vi.fn()}
      onCancel={vi.fn()}
    />
  );
}

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
  const ruler = host.querySelector('[data-ui="gallery.videoReview.ruler"]');
  if (ruler)
    Object.assign(ruler, {
      getBoundingClientRect: () => new DOMRect(0, 0, 400, 28),
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn(),
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

it.each(['text', 'annotation'] as const)('seeks once on the actual empty %s lane', (family) => {
  const selected = vi.fn();
  const { props, host } = renderTimeline({
    textTrack: family === 'text' ? <ActualTextLane selected={selected} /> : undefined,
    annotationEffectsTrack: family === 'annotation' ? <ActualAnnotationLane /> : undefined,
    onRangeCommit: vi.fn(),
  });
  planeWithMetrics(host);
  const lane = host.querySelector<HTMLElement>(
    family === 'text'
      ? '[data-ui="gallery.videoReview.textTrack"]'
      : '[data-ui="gallery.videoReview.annotationEffectsLane"]'
  )!;
  dispatchPlane(lane, [
    { type: 'pointerdown', x: 300 },
    { type: 'pointerup', x: 300 },
  ]);
  expect(props.onSeek).toHaveBeenCalledExactlyOnceWith(3);
  expect(props.onSelect).toHaveBeenCalledExactlyOnceWith({ kind: 'point', time: 3 });
  expect(props.onRangeCommit).not.toHaveBeenCalled();
  expect(selected).not.toHaveBeenCalled();
});

it('keeps nested text selection and resize outside plane seeking', () => {
  const selected = vi.fn();
  const { host, props } = renderTimeline({ textTrack: <ActualTextLane selected={selected} /> });
  planeWithMetrics(host);
  const block = host.querySelector<HTMLElement>('[data-text-id="text"]')!;
  const lane = block.parentElement!;
  vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 32));
  Object.assign(block, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  dispatchPlane(block.querySelector('span')!, [
    { type: 'pointerdown', x: 150 },
    { type: 'pointerup', x: 150 },
  ]);
  expect(selected).toHaveBeenCalledWith('text');
  dispatchPlane(block.querySelector('[data-text-edge="end"]')!, [
    { type: 'pointerdown', x: 200 },
    { type: 'pointerup', x: 200 },
  ]);
  expect(props.onSeek).not.toHaveBeenCalled();
  expect(props.onSelect).not.toHaveBeenCalled();
});

it('seeks source with the cursor without creating a range or restoring a generic frame', () => {
  const { host, props } = renderTimeline({
    selection: { kind: 'range', start: 1, end: 2 },
    onRangeCommit: vi.fn(),
  });
  const plane = planeWithMetrics(host);
  const lane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.sourceLane"]')!;
  hoverAt(lane, 100);
  expect(plane.style.cursor).toBe('default');
  dispatchPlane(lane, [
    { type: 'pointerdown', x: 100 },
    { type: 'pointermove', x: 250 },
    { type: 'pointerup', x: 250 },
  ]);
  expect(props.onSeek).toHaveBeenCalledExactlyOnceWith(1);
  expect(props.onSelect).toHaveBeenCalledExactlyOnceWith({ kind: 'point', time: 1 });
  expect(props.onRangeCommit).not.toHaveBeenCalled();
  expect(host.querySelector('[data-ui="gallery.videoReview.sourceRange"]')).toBeNull();
});

it('rejects delayed source drawing after returning to the cursor', () => {
  let admitted: (() => void) | undefined;
  const { host, props } = renderTimeline({
    sourceRangeTool: true,
    beforeAction: (action) => {
      admitted = action;
    },
    onRangeCommit: vi.fn(),
  });
  const plane = planeWithMetrics(host);
  dispatchPlane(host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.sourceLane"]')!, [
    { type: 'pointerdown', x: 100 },
  ]);
  dispatchPlane(plane, [
    { type: 'pointermove', x: 250 },
    { type: 'pointerup', x: 250 },
  ]);
  renderTimeline({ ...props, sourceRangeTool: false });
  act(() => admitted?.());
  expect(props.onRangeCommit).not.toHaveBeenCalled();
  expect(props.onSelect).not.toHaveBeenCalled();
  expect(props.onSeek).not.toHaveBeenCalled();
});

it.each([false, true])(
  'cancels speed-to-cut source tool changes with delayed admission=%s',
  (deferred) => {
    let admitted: (() => void) | undefined;
    const { host, props } = renderTimeline({
      sourceRangeTool: true,
      sourceRangeKind: 'speed',
      onRangeCommit: vi.fn(),
      beforeAction: (action) => {
        if (deferred) admitted = action;
        else action();
      },
    });
    const plane = planeWithMetrics(host);
    const lane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.sourceLane"]')!;
    dispatchPlane(lane, [{ type: 'pointerdown', x: 100 }]);
    if (deferred)
      dispatchPlane(plane, [
        { type: 'pointermove', x: 250 },
        { type: 'pointerup', x: 250 },
      ]);
    renderTimeline({ ...props, sourceRangeKind: 'cut' });
    if (!deferred) expect(plane.releasePointerCapture).toHaveBeenCalledOnce();
    dispatchPlane(plane, [
      { type: 'pointermove', x: 250 },
      { type: 'pointerup', x: 250 },
    ]);
    act(() => admitted?.());
    expect(props.onRangeCommit).not.toHaveBeenCalled();
    expect(host.querySelector('[data-ui="gallery.videoReview.sourceDrawPreview"]')).toBeNull();
    if (deferred) expect(props.onSeek).not.toHaveBeenCalled();
  }
);

it.each(['release', 'Escape', 'cancel', 'tool-change'] as const)(
  'shows only active source drawing preview and clears it on %s',
  (completion) => {
    const { host, props } = renderTimeline({
      sourceRangeTool: true,
      sourceRangeKind: 'speed',
      onRangeCommit: vi.fn(),
    });
    const plane = planeWithMetrics(host);
    dispatchPlane(host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.sourceLane"]')!, [
      { type: 'pointerdown', x: 100 },
    ]);
    dispatchPlane(plane, [{ type: 'pointermove', x: 250 }]);
    const preview = host.querySelector<HTMLElement>(
      '[data-ui="gallery.videoReview.sourceDrawPreview"]'
    )!;
    expect(preview.style.left).toBe('25%');
    expect(preview.style.width).toBe('37.5%');
    expect(preview.className).toContain('sniptale-color-info');
    expect(host.querySelector('[data-ui="gallery.videoReview.sourceRange"]')).toBeNull();
    if (completion === 'Escape')
      act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    else if (completion === 'cancel') dispatchPlane(plane, [{ type: 'pointercancel', x: 250 }]);
    else if (completion === 'tool-change') renderTimeline({ ...props, sourceRangeTool: false });
    dispatchPlane(plane, [{ type: 'pointerup', x: 250 }]);
    expect(host.querySelector('[data-ui="gallery.videoReview.sourceDrawPreview"]')).toBeNull();
    if (completion === 'release')
      expect(props.onRangeCommit).toHaveBeenCalledExactlyOnceWith({
        kind: 'range',
        start: 1,
        end: 2.5,
      });
    else expect(props.onRangeCommit).not.toHaveBeenCalled();
  }
);

it('shows an exact range-start guide only over drawing zones, with neutral seek and control cursors', () => {
  const { host, props } = renderTimeline({
    originalRangeTool: true,
    zoomTrack: <div data-ui="gallery.videoReview.zoomLane" />,
    audioTracks: {
      originalAudio: (
        <>
          <div data-ui="gallery.videoReview.audioLane" data-original-audio-lane />
          <div data-ui="gallery.videoReview.audioLane" />
        </>
      ),
    },
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

it('keeps advisory time visible across gaps without offering a focus insertion cursor', () => {
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
  expect(host.querySelector('[data-ui="gallery.videoReview.hoverTime"]')).not.toBeNull();
  hoverAt(host.querySelector('[data-ui="focus-lane-child"]')!, 180);
  expect(plane.style.cursor).toContain('4 16, cell');
  hoverAt(plane, 180);
  expect(plane.style.cursor).toBe('default');
  expect(host.querySelector('[data-ui="gallery.videoReview.hoverTime"]')).not.toBeNull();
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
    audioTracks: {
      originalAudio: (
        <ReviewTrackRow label="Original audio">
          <div
            data-ui="gallery.videoReview.audioLane"
            data-original-audio-lane
            onPointerDown={localDown}
          />
        </ReviewTrackRow>
      ),
    },
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

it('keeps ruler looping separate while existing edit bodies and trim handles take cursor priority', () => {
  const onRangeCommit = vi.fn();
  const onPlaybackRange = vi.fn();
  const { host, props } = renderTimeline({
    onPlaybackRange,
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
  dispatchPlane(ruler as HTMLElement, [
    { type: 'pointermove', x: 180 },
    { type: 'pointerup', x: 180 },
  ]);
  expect(props.onSelect).not.toHaveBeenCalled();
  expect(onRangeCommit).not.toHaveBeenCalled();
  expect(onPlaybackRange).toHaveBeenCalledExactlyOnceWith({ start: 1, end: 1.8 });
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

it('keeps source seeking and ruler looping separate while the focus drawing tool owns range selection', () => {
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
    expect(plane.style.cursor).toEqual(
      selector === 'ruler' ? expect.stringContaining('4 16, cell') : 'default'
    );
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
    expect(plane.style.cursor).toEqual(
      selector === 'ruler' ? expect.stringContaining('4 16, cell') : 'default'
    );
    dispatchPlane(target, [
      { type: 'pointerdown', x: 100 },
      { type: 'pointermove', x: 250 },
      { type: 'pointerup', x: 250 },
    ]);
    expect(props.onSelect).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'range' }));
    expect(onRangeCommit).not.toHaveBeenCalled();
  }
});

it('reveals only the active tool lane vertically and preserves horizontal scrolling and selections', () => {
  const { host, props } = renderTimeline({
    zoomTrack: <div data-ui="gallery.videoReview.zoomLane" />,
    audioTracks: {
      originalAudio: <div data-ui="gallery.videoReview.audioLane" data-original-audio-lane />,
    },
    annotationEffectsTrack: <ActualAnnotationLane />,
    playbackRange: { start: 1, end: 3 },
  });
  const viewport = host.querySelector<HTMLElement>(
    '[data-ui="gallery.videoReview.timelineViewport"]'
  )!;
  viewport.scrollLeft = 400;
  const ruler = host.querySelector('[data-ui="gallery.videoReview.rulerRow"]')!;
  Object.assign(ruler, { getBoundingClientRect: () => new DOMRect(0, 100, 800, 28) });
  Object.assign(viewport, { getBoundingClientRect: () => new DOMRect(0, 100, 800, 100) });
  const source = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.sourceLane"]')!;
  const focus = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.zoomLane"]')!;
  const annotation = host.querySelector('[data-ui="gallery.videoReview.annotationEffectsLane"]')!;
  const audio = host.querySelector<HTMLElement>('[data-original-audio-lane]')!;
  for (const [lane, top] of [
    [source, 300],
    [focus, 400],
    [audio, 500],
    [annotation, 600],
  ] as const)
    Object.assign(lane, { getBoundingClientRect: () => new DOMRect(120, top, 600, 40) });
  renderTimeline({ ...props, onFocusRangeCommit: vi.fn() });
  expect(viewport.scrollTop).toBe(268);
  renderTimeline({ ...props, sourceRangeTool: true });
  expect(viewport.scrollTop).toBe(436);
  renderTimeline({ ...props, originalRangeTool: true });
  expect(viewport.scrollTop).toBe(804);
  renderTimeline({ ...props, annotationTool: true });
  expect(viewport.scrollTop).toBe(1272);
  expect(viewport.scrollLeft).toBe(400);
  expect(props.onSelect).not.toHaveBeenCalled();
  expect(props.onSeek).not.toHaveBeenCalled();
  expect(host.querySelector('[data-ui="gallery.videoReview.playbackRangeOverlay"]')).not.toBeNull();
});

it('removes the add cursor and explains blocked selected-range placement', () => {
  const { host } = renderTimeline({
    sourceRangeTool: true,
    placementHints: { source: 'Range already occupied' },
  });
  const plane = planeWithMetrics(host);
  hoverAt(host.querySelector('[data-ui="gallery.videoReview.sourceLane"]')!, 100);
  expect(plane.style.cursor).toBe('crosshair');
  expect(plane.title).toBe('Range already occupied');
});

it('clears the hover guide even when a camera child intercepts pointer movement', () => {
  const { host } = renderTimeline();
  const plane = planeWithMetrics(host);
  hoverAt(host.querySelector('[data-ui="gallery.videoReview.sourceLane"]')!, 400);
  expect(host.querySelector('[data-ui="gallery.videoReview.hoverTime"]')).not.toBeNull();
  const camera = document.createElement('div');
  camera.dataset['ui'] = 'gallery.videoReview.webcamTrack';
  camera.addEventListener('pointermove', (event) => event.stopPropagation());
  plane.append(camera);
  hoverAt(camera, 450);
  expect(host.querySelector('[data-ui="gallery.videoReview.hoverTime"]')).toBeNull();
});

it('orders action-history controls by navigation, filtering, then applying effects', () => {
  const marker = {
    ref: { kind: 'action' as const, id: 'click' },
    eventType: 'CLICK',
    start: 0.5,
    end: 0.5,
  };
  const toggle = vi.fn();
  const { host } = renderTimeline({
    markers: [marker],
    actionsEnabled: false,
    onToggleActions: toggle,
  });
  const controls = ['historyOpen', 'historyAnimatedOnly', 'historyEffectsEnabled'].map((key) =>
    host.querySelector<HTMLButtonElement>(`[aria-label="gallery.videoReview.${key}"]`)!
  );
  expect(controls.every(Boolean)).toBe(true);
  expect(controls[0]!.querySelector('svg')?.classList.contains('lucide-search')).toBe(true);
  expect(
    controls[0]!.compareDocumentPosition(controls[1]!) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
  expect(
    controls[1]!.compareDocumentPosition(controls[2]!) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
  expect(controls[2]!.getAttribute('aria-pressed')).toBe('false');
  expect(controls[2]!.className).toContain('aria-[pressed=false]');
  expect(controls[2]!.querySelector('svg')?.classList.contains('lucide-eye-off')).toBe(true);
  act(() => controls[2]!.click());
  expect(toggle).toHaveBeenCalledOnce();
});

it('offers the annotation placement cursor only when ready and reveals its active lane', () => {
  renderTimeline({
    annotationTool: true,
    annotationDrawing: true,
    annotationEffectsTrack: <ActualAnnotationLane />,
  });
  const plane = planeWithMetrics(host);
  const lane = host.querySelector('[data-ui="gallery.videoReview.annotationEffectsLane"]')!;
  expect(host.querySelector('[data-active-tool-lane="annotation"]')).not.toBeNull();
  hoverAt(lane, 200);
  expect(plane.style.cursor).toContain('4 16, cell');
  hoverAt(host.querySelector('[data-ui="gallery.videoReview.trackHeader"]')!, 200);
  expect(plane.style.cursor).toBe('default');
  renderTimeline({
    annotationTool: true,
    annotationDrawing: false,
    annotationEffectsTrack: <ActualAnnotationLane />,
  });
  hoverAt(lane, 200);
  expect(plane.style.cursor).toBe('default');
});
