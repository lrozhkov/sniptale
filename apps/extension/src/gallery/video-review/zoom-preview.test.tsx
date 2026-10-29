// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as scenePlans from '../../features/video/review/advanced/scene';
import { ReviewZoomPreview } from './zoom-preview';
import type { ZoomPreviewFrame } from './use-zoom-preview-source';
import type { QuickEditZoomRegion } from '../../features/video/review/advanced/types';
import type { QuickEditZoomRegionPatch } from '../../features/video/review/advanced/zoom';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';

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

const background = createQuickEditAdvancedState().background;

const region = (overrides?: Partial<QuickEditZoomRegion>): QuickEditZoomRegion => ({
  id: 'zoom-1',
  start: 2,
  end: 4,
  transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
  enter: { type: 'ease-in-out', duration: 0.3 },
  exit: { type: 'ease-in-out', duration: 0.3 },
  ...overrides,
});

const frame: ZoomPreviewFrame = {
  image: document.createElement('canvas'),
  width: 640,
  height: 360,
};

function renderPreview(args: {
  cursorFollowing?: boolean;
  focus?: ComponentProps<typeof ReviewZoomPreview>['focus'];
  region?: QuickEditZoomRegion;
  spatialEdit?: ComponentProps<typeof ReviewZoomPreview>['spatialEdit'];
  sourceTime?: number | null;
  loadFrame?: (sourceTime: number, signal: AbortSignal) => Promise<ZoomPreviewFrame>;
  onInteract?: (time: number) => void;
  onChange?: (patch: QuickEditZoomRegionPatch) => void;
  onPreview?: (patch: QuickEditZoomRegionPatch | null) => void;
}) {
  const onChange = args.onChange ?? vi.fn();
  const loadFrame = args.loadFrame === undefined ? vi.fn(async () => frame) : vi.fn(args.loadFrame);
  act(() => {
    root.render(
      <ReviewZoomPreview
        region={args.region ?? region()}
        focus={args.focus}
        cursorFollowing={args.cursorFollowing ?? false}
        {...(args.spatialEdit ? { spatialEdit: args.spatialEdit } : {})}
        background={background}
        source={{ width: 640, height: 360 }}
        sourceTime={args.sourceTime === undefined ? 3 : args.sourceTime}
        loadFrame={loadFrame}
        onInteract={args.onInteract}
        onChange={onChange}
        onPreview={args.onPreview}
      />
    );
  });
  const section = () =>
    host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.zoomPreview"]')!;
  const canvas = () => host.querySelector<HTMLCanvasElement>('canvas')!;
  return { onChange, loadFrame, section, canvas };
}

const pointer = (canvas: HTMLCanvasElement, kind: string, x: number, y = 0) =>
  act(async () => {
    canvas.dispatchEvent(
      new MouseEvent(kind, { bubbles: true, clientX: x, clientY: y, button: 0 })
    );
  });

it('loads the mapped source frame once and exposes the Area/Result switch', async () => {
  const view = renderPreview({ sourceTime: 3 });
  await act(async () => Promise.resolve());
  expect(view.loadFrame).toHaveBeenCalledTimes(1);
  expect(view.loadFrame.mock.calls[0]![0]).toBe(3);
  expect(view.section().getAttribute('data-status')).toBe('ready');
  expect(view.section().getAttribute('data-view')).toBe('area');
  const result = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.title === 'gallery.videoReview.zoomPreviewResult'
  )!;
  await act(async () => result.click());
  expect(view.section().getAttribute('data-view')).toBe('result');
});

it('publishes live framing without persisting until release', async () => {
  const onChange = vi.fn((_patch: QuickEditZoomRegionPatch) => undefined);
  const onPreview = vi.fn();
  const view = renderPreview({ onChange, onPreview });
  await act(async () => Promise.resolve());
  const canvas = view.canvas();
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 480, 270));
  Object.assign(canvas, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  await pointer(canvas, 'pointerdown', 120, 67.5);
  // Pointer movement is local until release: cancel never writes a persisted edit.
  expect(onChange).not.toHaveBeenCalled();
  await pointer(canvas, 'pointermove', 9999, -500);
  expect(onChange).not.toHaveBeenCalled();
  expect(onPreview).toHaveBeenLastCalledWith({ centerX: 1, centerY: 0 });
  await pointer(canvas, 'pointerup', 9999);
  expect(onChange).toHaveBeenLastCalledWith({ centerX: 1, centerY: 0 });
});

it('rolls the draft back to its origin on Escape and pointer cancel', async () => {
  const onChange = vi.fn((_patch: QuickEditZoomRegionPatch) => undefined);
  const view = renderPreview({ onChange });
  await act(async () => Promise.resolve());
  const canvas = view.canvas();
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 480, 270));
  Object.assign(canvas, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  await pointer(canvas, 'pointerdown', 240, 135);
  await pointer(canvas, 'pointermove', 480, 270);
  expect(onChange).not.toHaveBeenCalled();
  await pointer(canvas, 'pointercancel', 480, 270);
  expect(onChange).not.toHaveBeenCalled();
  await act(async () => {
    canvas.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  });
  expect(onChange).toHaveBeenLastCalledWith({ centerX: 0.51, centerY: 0.5 });
  await act(async () => {
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  expect(onChange).toHaveBeenLastCalledWith({ centerX: 0.5, centerY: 0.5 });
});

it('cancels a stale frame load when the mapped source time changes', async () => {
  const signals: AbortSignal[] = [];
  const pending = new Array<Promise<ZoomPreviewFrame>>();
  const view = renderPreview({
    sourceTime: 3,
    loadFrame: (_time, signal) => {
      signals.push(signal);
      const task = new Promise<ZoomPreviewFrame>(() => undefined);
      pending.push(task);
      return task;
    },
  });
  expect(view.loadFrame).toHaveBeenCalledTimes(1);
  const next = region({ start: 6, end: 8 });
  await act(async () => {
    root.render(
      <ReviewZoomPreview
        region={next}
        background={background}
        source={{ width: 640, height: 360 }}
        sourceTime={7}
        loadFrame={view.loadFrame}
        onChange={view.onChange}
      />
    );
  });
  expect(signals[0]!.aborted).toBe(true);
  expect(view.loadFrame).toHaveBeenCalledTimes(2);
  expect(view.loadFrame.mock.calls[1]![0]).toBe(7);
  expect(view.section().getAttribute('data-status')).toBe('loading');
});

it('reports failures accessibly and retries through the loader', async () => {
  let calls = 0;
  const view = renderPreview({
    loadFrame: async () => {
      calls += 1;
      if (calls === 1) throw new Error('decode failed');
      return frame;
    },
  });
  await act(async () => Promise.resolve());
  expect(view.section().getAttribute('data-status')).toBe('failed');
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.retry"]')!.click()
  );
  await act(async () => Promise.resolve());
  expect(view.loadFrame).toHaveBeenCalledTimes(2);
  expect(view.section().getAttribute('data-status')).toBe('ready');
});

it('skips the load and explains the state when the midpoint has no source frame', async () => {
  const view = renderPreview({ sourceTime: null });
  await act(async () => Promise.resolve());
  expect(view.loadFrame).not.toHaveBeenCalled();
  expect(view.section().getAttribute('data-status')).toBe('unavailable');
  expect(host.querySelector('[role="status"]')?.textContent).toContain(
    'gallery.videoReview.zoomPreviewUnavailable'
  );
});

it('synchronizes framing gestures to the displayed source frame, not unrelated keys', async () => {
  const onInteract = vi.fn();
  const view = renderPreview({ sourceTime: 7.25, onInteract });
  expect(onInteract).not.toHaveBeenCalled();
  await act(async () => Promise.resolve());
  await act(async () =>
    view.canvas().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  );
  expect(onInteract).toHaveBeenCalledWith(7.25);
  onInteract.mockClear();
  await act(async () =>
    view.canvas().dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
  );
  expect(onInteract).not.toHaveBeenCalled();
});

it('drags anywhere inside the following-background Area footprint without click-to-place', async () => {
  const onChange = vi.fn();
  const onPreview = vi.fn();
  await act(async () =>
    root.render(
      <ReviewZoomPreview
        region={region()}
        background={{
          enabled: true,
          type: 'solid',
          color: '#000000ff',
          zoomBehavior: 'follow-video',
          layout: { padding: 100, cornerRadius: 20 },
        }}
        source={{ width: 800, height: 800 }}
        sourceTime={3}
        loadFrame={async () => frame}
        onChange={onChange}
        onPreview={onPreview}
      />
    )
  );
  const canvas = host.querySelector('canvas')!;
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 480, 480));
  Object.assign(canvas, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  // Fitted video is x=60..420; x=132 is source x=.20, inside the drawn .167..833 area.
  await pointer(canvas, 'pointerdown', 132, 240);
  expect(onPreview).toHaveBeenLastCalledWith({ centerX: 0.5, centerY: 0.5 });
  await pointer(canvas, 'pointerup', 132, 240);
  expect(onChange).not.toHaveBeenCalled();
  await pointer(canvas, 'pointerdown', 132, 240);
  await pointer(canvas, 'pointermove', 168, 240);
  await pointer(canvas, 'pointerup', 168, 240);
  expect(onChange).toHaveBeenLastCalledWith({ centerX: 0.6, centerY: 0.5 });
});

it.each(['nw', 'ne', 'sw', 'se'])(
  'resizes Zoom Area from %s using the full canvas coordinate system',
  async (corner) => {
    const onChange = vi.fn();
    const onPreview = vi.fn();
    const view = renderPreview({ onChange, onPreview });
    await act(async () => Promise.resolve());
    const canvas = view.canvas();
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 480, 270));
    Object.assign(canvas, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn(),
    });
    const area = host.querySelector<HTMLElement>('[data-focus-frame]')!;
    vi.spyOn(area, 'getBoundingClientRect').mockReturnValue(new DOMRect(120, 67.5, 240, 135));
    const grip = area.querySelector<HTMLElement>(`[data-resize="${corner}"]`)!;
    const west = corner.endsWith('w'),
      north = corner.startsWith('n');
    const dispatch = async (target: Element, kind: string, x: number, y: number) =>
      act(async () => {
        const event = new MouseEvent(kind, { bubbles: true, button: 0, clientX: x, clientY: y });
        Object.defineProperty(event, 'pointerId', { value: 7 });
        target.dispatchEvent(event);
      });
    await dispatch(grip, 'pointerdown', west ? 120 : 360, north ? 67.5 : 202.5);
    expect(canvas.setPointerCapture).toHaveBeenCalledWith(7);
    await dispatch(canvas, 'pointermove', west ? 72 : 408, north ? 40.5 : 229.5);
    expect(onChange).not.toHaveBeenCalled();
    expect(onPreview).toHaveBeenLastCalledWith(
      expect.objectContaining({ scale: expect.any(Number) })
    );
    await dispatch(canvas, 'pointerup', west ? 72 : 408, north ? 40.5 : 229.5);
    expect(onChange).toHaveBeenCalledTimes(1);
    const patch = onChange.mock.calls[0]![0];
    // Default background has padding: validate actual opposite corner, not an assumed 1/scale crop.
    expect(patch.scale).toBeGreaterThanOrEqual(1);
    expect(patch.scale).toBeLessThan(2);
    expect(canvas.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(area.dataset['controlsVisible']).toBe('true');
  }
);

it.each(['pointercancel', 'lostpointercapture', 'Escape', 'blur'])(
  'rolls back a corner draft on %s and releases capture before later events',
  async (cancellation) => {
    const onChange = vi.fn(),
      onPreview = vi.fn();
    const view = renderPreview({ onChange, onPreview });
    await act(async () => Promise.resolve());
    const canvas = view.canvas();
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 480, 270));
    const release = vi.fn(() =>
      canvas.dispatchEvent(new MouseEvent('lostpointercapture', { bubbles: true }))
    );
    Object.assign(canvas, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: release,
    });
    const area = host.querySelector<HTMLElement>('[data-focus-frame]')!;
    await pointer(
      area.querySelector('[data-resize="se"]')! as HTMLCanvasElement,
      'pointerdown',
      350,
      200
    );
    await pointer(canvas, 'pointermove', 470, 250);
    expect(onPreview).toHaveBeenLastCalledWith(
      expect.objectContaining({ scale: expect.any(Number) })
    );
    await act(async () => {
      if (cancellation === 'Escape')
        canvas.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
      else if (cancellation === 'blur') window.dispatchEvent(new Event('blur'));
      else canvas.dispatchEvent(new MouseEvent(cancellation, { bubbles: true }));
    });
    await pointer(canvas, 'pointerup', 470, 250);
    expect(onChange).not.toHaveBeenCalled();
    expect(onPreview).toHaveBeenLastCalledWith(null);
    expect(release).toHaveBeenCalledTimes(1);
  }
);

it('keeps the inspector Zoom area visible before hover and after pointer departure', async () => {
  const view = renderPreview({});
  await act(async () => Promise.resolve());
  const area = () => host.querySelector<HTMLElement>('[data-focus-frame]')!;
  expect(area().getAttribute('data-controls-visible')).toBe('true');
  await pointer(view.canvas(), 'pointermove', 60);
  await pointer(view.canvas(), 'pointerleave', -10);
  expect(area().getAttribute('data-controls-visible')).toBe('true');
  renderPreview({
    region: region({ id: 'zoom-2', transform: { scale: 3, centerX: 0.4, centerY: 0.6 } }),
  });
  await act(async () => Promise.resolve());
  expect(area().getAttribute('data-controls-visible')).toBe('true');
});

it('refreshes the whole Follow Video footprint after scene edits without camera writes', async () => {
  const onChange = vi.fn();
  const loadFrame = vi.fn(async () => frame);
  const selected = region({ transform: { scale: 1.25, centerX: 0.1, centerY: 0.5 } });
  const render = async (
    enabled: boolean,
    zoomBehavior: 'fixed' | 'follow-video',
    padding = 100,
    canvas?: { width: number; height: number }
  ) => {
    await act(async () =>
      root.render(
        <ReviewZoomPreview
          region={selected}
          background={
            enabled
              ? {
                  enabled: true,
                  type: 'solid',
                  color: '#000000ff',
                  zoomBehavior,
                  layout: { padding, cornerRadius: 0 },
                }
              : { enabled: false, zoomBehavior }
          }
          source={{ width: 800, height: 800 }}
          canvas={canvas}
          sourceTime={3}
          loadFrame={loadFrame}
          onChange={onChange}
        />
      )
    );
    return host.querySelector<HTMLElement>('[data-focus-frame]')!;
  };
  let area = await render(true, 'follow-video');
  expect(Number.parseFloat(area.style.left)).toBeCloseTo(2.5);
  expect(Number.parseFloat(area.style.width)).toBeCloseTo(80);
  area = await render(true, 'fixed');
  expect(Number.parseFloat(area.style.left)).toBeCloseTo(12.5);
  expect(Number.parseFloat(area.style.width)).toBeCloseTo(60);
  area = await render(true, 'follow-video', 160);
  expect(Number.parseFloat(area.style.left)).toBeCloseTo(4);
  expect(Number.parseFloat(area.style.width)).toBeCloseTo(80);
  area = await render(true, 'follow-video', 100, { width: 800, height: 400 });
  expect(Number.parseFloat(area.style.left)).toBeCloseTo(7.5);
  expect(Number.parseFloat(area.style.width)).toBeCloseTo(80);
  area = await render(false, 'follow-video');
  expect(Number.parseFloat(area.style.left)).toBeCloseTo(0);
  expect(Number.parseFloat(area.style.width)).toBeCloseTo(80);
  expect(onChange).not.toHaveBeenCalled();
  expect(loadFrame).toHaveBeenCalledTimes(1);
});

it('paints live transport, then restores the target and cancels animation on stop or unmount', async () => {
  const drawImage = vi.fn();
  const context = {
    clearRect: vi.fn(),
    save: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    drawImage,
    restore: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D
  );
  const requests = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    requests.set(++sequence, callback);
    return sequence;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => requests.delete(id));
  const onChange = vi.fn();
  const onInteract = vi.fn();
  const video = document.createElement('video');
  const loadFrame = vi.fn(async () => frame);
  const render = (scale?: number) =>
    act(async () =>
      root.render(
        <ReviewZoomPreview
          region={region()}
          background={{ ...background, enabled: false }}
          source={{ width: 640, height: 360 }}
          sourceTime={3}
          loadFrame={loadFrame}
          onChange={onChange}
          onInteract={onInteract}
          playback={scale ? { video, camera: { scale, centerX: 0.5, centerY: 0.5 } } : undefined}
        />
      )
    );
  await render(1);
  expect(drawImage).toHaveBeenLastCalledWith(video, 0, 0, 480, 270);
  const area = () => host.querySelector<HTMLElement>('[data-focus-frame]')!;
  expect(Number.parseFloat(area().style.width)).toBeCloseTo(100);
  const [id, tick] = [...requests.entries()][0]!;
  requests.delete(id);
  drawImage.mockClear();
  tick(16);
  expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 480, 270);
  await render(1.5);
  expect(Number.parseFloat(area().style.width)).toBeCloseTo(100 / 1.5);
  await pointer(host.querySelector('canvas')!, 'pointerdown', 20, 20);
  expect(onInteract).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
  await render();
  expect(Number.parseFloat(area().style.width)).toBeCloseTo(50);
  expect(drawImage).toHaveBeenLastCalledWith(frame.image, 0, 0, 480, 270);
  drawImage.mockClear();
  await act(async () => {
    const pending = [...requests.entries()];
    for (const [id, callback] of pending) {
      requests.delete(id);
      callback(32);
    }
  });
  expect(drawImage).not.toHaveBeenCalled();
  expect(requests.size).toBe(0);
  expect(loadFrame).toHaveBeenCalledTimes(1);
  await render(1);
  await act(async () => root.render(null));
  expect(requests.size).toBe(0);
});

it.each(['fixed', 'follow-video'] as const)(
  'keeps the %s framing marker at the rendered center before and during capture',
  async (zoomBehavior) => {
    const onChange = vi.fn();
    await act(async () =>
      root.render(
        <ReviewZoomPreview
          region={region({ transform: { scale: 1.25, centerX: 0.1, centerY: 0.9 } })}
          background={{
            enabled: true,
            type: 'solid',
            color: '#123456ff',
            zoomBehavior,
            layout: { padding: 100, cornerRadius: 0 },
          }}
          source={{ width: 800, height: 800 }}
          sourceTime={3}
          loadFrame={async () => frame}
          onChange={onChange}
        />
      )
    );
    const canvas = host.querySelector('canvas')!;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 480, 480));
    Object.assign(canvas, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn(),
    });
    const marker = host.querySelector<HTMLElement>('.review-focus-center')!;
    expect(Number.parseFloat(marker.style.left)).toBeCloseTo(50);
    expect(Number.parseFloat(marker.style.top)).toBeCloseTo(50);
    const resting = marker.style.cssText;
    await pointer(canvas, 'pointerdown', 204, 276);
    expect(marker.style.cssText).toBe(resting);
    await pointer(canvas, 'pointerup', 204, 276);
    expect(marker.style.cssText).toBe(resting);
    expect(onChange).not.toHaveBeenCalled();
  }
);

const spatialRegion = () =>
  region({
    perspective: { enabled: true, rotateX: 25, rotateY: -30, rotateZ: 12, strength: 0.65 },
    depthOfField: {
      enabled: true,
      mode: 'area',
      x: 0.4,
      y: 0.6,
      width: 0.2,
      softness: 0.05,
      strength: 0.7,
    },
  });
function previewButton(key: string) {
  const button = host.querySelector<HTMLButtonElement>(
    `button[title="gallery.videoReview.${key}"]`
  );
  if (!button) throw new Error(`Missing preview control ${key}`);
  return button;
}

it('opens focus controls for a new Zoom and preserves stored focus values when switching Off', async () => {
  const authored = region();
  const onCommit = vi.fn();
  renderPreview({ region: authored, spatialEdit: { region: authored, revision: 'new', onCommit } });
  await act(async () => Promise.resolve());
  await act(async () => previewButton('spatialToolFocus').click());
  expect(previewButton('spatialFocusCenter').disabled).toBe(false);
  expect(onCommit).not.toHaveBeenCalled();
  await act(async () => previewButton('depthModeArea').click());
  expect(onCommit.mock.calls[0]?.[1]?.depthOfField).toMatchObject({ enabled: true, mode: 'area' });
  const configured = spatialRegion();
  renderPreview({
    region: configured,
    spatialEdit: { region: configured, revision: 'configured', onCommit },
  });
  await act(async () => Promise.resolve());
  await act(async () => previewButton('depthModeOff').click());
  expect(onCommit).toHaveBeenLastCalledWith('configured', {
    depthOfField: { ...configured.depthOfField, enabled: false },
  });
});

it('keeps spatial navigation read-only, restores framing, and owns just one decoded frame', async () => {
  const authored = spatialRegion();
  const onCommit = vi.fn();
  const onInteract = vi.fn();
  const view = renderPreview({
    region: authored,
    spatialEdit: { region: authored, revision: 'authored', onCommit },
    onInteract,
  });
  await act(async () => Promise.resolve());
  expect(view.section().dataset['view']).toBe('area');
  await act(async () => previewButton('spatialToolTilt').click());
  expect(view.section().dataset['view']).toBe('result');
  expect(view.canvas().tabIndex).toBe(-1);
  expect(host.querySelector('[data-ui="gallery.videoReview.previewMode"]')).toBeNull();
  await act(async () => previewButton('spatialToolRotation').click());
  await act(async () => previewButton('spatialToolFocus').click());
  await act(async () => previewButton('spatialToolPosition').click());
  expect(view.section().dataset['view']).toBe('area');
  expect(view.canvas().tabIndex).toBe(0);
  await act(async () => previewButton('zoomPreviewResult').click());
  await act(async () => previewButton('spatialToolTilt').click());
  await act(async () => previewButton('spatialToolPosition').click());
  expect(view.section().dataset['view']).toBe('result');
  expect(onInteract).not.toHaveBeenCalled();
  expect(onCommit).not.toHaveBeenCalled();
  expect(view.onChange).not.toHaveBeenCalled();
  expect(view.loadFrame).toHaveBeenCalledTimes(1);
});

it.each([
  ['spatialToolPosition', 'spatialResetPosition', { scale: 1.5, centerX: 0.5, centerY: 0.5 }],
  [
    'spatialToolTilt',
    'spatialResetTilt',
    { perspective: { enabled: true, rotateX: 0, rotateY: 0, rotateZ: 12, strength: 0.5 } },
  ],
  [
    'spatialToolRotation',
    'spatialResetRotation',
    { perspective: { enabled: true, rotateX: 25, rotateY: -30, rotateZ: 0, strength: 0.65 } },
  ],
  [
    'spatialToolFocus',
    'spatialResetFocus',
    {
      depthOfField: {
        enabled: false,
        mode: 'depth',
        x: 0.5,
        y: 0.5,
        width: 0.2,
        softness: 0.3,
        strength: 0.5,
      },
    },
  ],
] as const)('scopes %s reset to its authored group', async (tool, reset, patch) => {
  const authored = spatialRegion();
  const onCommit = vi.fn();
  const view = renderPreview({
    region: authored,
    spatialEdit: { region: authored, revision: 'capture', onCommit },
  });
  await act(async () => Promise.resolve());
  await act(async () => previewButton(tool).click());
  await act(async () => previewButton(reset).click());
  expect(onCommit).toHaveBeenCalledExactlyOnceWith('capture', patch);
  expect(view.onChange).not.toHaveBeenCalled();
});

it('routes an admitted spatial gesture once without also moving or seeking the Position canvas', async () => {
  const authored = spatialRegion();
  const onCommit = vi.fn();
  const onPreview = vi.fn();
  const onInteract = vi.fn();
  const view = renderPreview({
    region: authored,
    spatialEdit: { region: authored, revision: 'capture', onCommit },
    onPreview,
    onInteract,
  });
  await act(async () => Promise.resolve());
  await act(async () => previewButton('spatialToolTilt').click());
  const handle = previewButton('spatialDragTilt');
  const bounds = view.canvas().parentElement!;
  vi.spyOn(bounds, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 480, 270));
  Object.assign(handle, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  const send = (type: string, x: number, y: number) =>
    act(async () => {
      handle.dispatchEvent(
        new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y })
      );
    });
  await send('pointerdown', 200, 100);
  await send('pointermove', 224, 73);
  await send('pointerup', 248, 73);
  expect(onInteract).toHaveBeenCalledExactlyOnceWith(3);
  expect(onCommit).toHaveBeenCalledExactlyOnceWith('capture', {
    perspective: { ...authored.perspective, rotateX: 34, rotateY: -21 },
  });
  expect(onPreview).toHaveBeenLastCalledWith(null);
  expect(view.onChange).not.toHaveBeenCalled();
  expect(view.loadFrame).toHaveBeenCalledTimes(1);
});

it('cancels captured spatial coordinates when the scene canvas changes without replacing the target', async () => {
  const authored = spatialRegion();
  const onPreview = vi.fn();
  const onCommit = vi.fn();
  const loadFrame = vi.fn(async () => frame);
  const render = (width: number, height: number) =>
    act(async () =>
      root.render(
        <ReviewZoomPreview
          region={authored}
          spatialEdit={{ region: authored, revision: 'same-target', onCommit }}
          background={background}
          source={{ width: 640, height: 360 }}
          canvas={{ width, height }}
          sourceTime={3}
          loadFrame={loadFrame}
          onChange={vi.fn()}
          onPreview={onPreview}
        />
      )
    );
  await render(640, 360);
  await act(async () => previewButton('spatialToolFocus').click());
  const center = previewButton('spatialFocusCenter');
  const bounds = host.querySelector('canvas')!.parentElement!;
  vi.spyOn(bounds, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 480, 270));
  const release = vi.fn();
  Object.assign(center, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: release,
  });
  await act(async () =>
    center.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 200, clientY: 140 })
    )
  );
  await act(async () =>
    center.dispatchEvent(
      new MouseEvent('pointermove', { bubbles: true, clientX: 215, clientY: 140 })
    )
  );
  await render(360, 640);
  expect(release).toHaveBeenCalledTimes(1);
  expect(onPreview).toHaveBeenLastCalledWith(null);
  expect(previewButton('spatialFocusCenter')).not.toBe(center);
  expect(host.querySelector('canvas')!.height).toBeGreaterThan(host.querySelector('canvas')!.width);
  await act(async () =>
    center.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 215, clientY: 140 }))
  );
  expect(onCommit).not.toHaveBeenCalled();
  expect(loadFrame).toHaveBeenCalledTimes(1);
});

it('keeps Area/Result navigation available while following disables manual position dragging', async () => {
  const authored = region();
  const onCommit = vi.fn();
  const view = renderPreview({
    cursorFollowing: true,
    spatialEdit: { region: authored, revision: 'follow', onCommit },
  });
  await act(async () => Promise.resolve());
  expect(previewButton('zoomPreviewResult').disabled).toBe(false);
  const canvas = view.canvas();
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 480, 270));
  await pointer(canvas, 'pointerdown', 20, 20);
  await pointer(canvas, 'pointermove', 80, 80);
  await pointer(canvas, 'pointerup', 80, 80);
  expect(view.onChange).not.toHaveBeenCalled();
  expect(onCommit).not.toHaveBeenCalled();
  await act(async () => previewButton('zoomPreviewResult').click());
  expect(view.section().getAttribute('data-view')).toBe('result');
});

it.each(['border', 'spotlight'] as const)(
  'does not prepare a follow-camera plan for a %s edit overlay',
  async (type) => {
    const { createQuickEditBorder, createQuickEditSpotlight } =
      await import('../../features/video/project/scene/focus-appearance');
    vi.spyOn(await import('./border-overlay'), 'ReviewBorderOverlay').mockImplementation(() => (
      <></>
    ));
    vi.spyOn(await import('./spotlight-overlay'), 'ReviewSpotlightOverlay').mockImplementation(
      () => <></>
    );
    const plan = vi.spyOn(scenePlans, 'resolveReviewSceneCameraPlan').mockReturnValue(null);
    const overlay = region({
      [type]: type === 'border' ? createQuickEditBorder() : createQuickEditSpotlight(),
      cursorFocus: {
        path: {
          version: 1,
          mode: 'follow',
          smoothing: 0.5,
          sensitivity: 0.5,
          gapPolicy: 'hold',
          segments: [],
        },
      },
    });
    renderPreview({ region: overlay, focus: { regions: [overlay], time: 3 } });
    await act(async () => Promise.resolve());
    expect(plan).not.toHaveBeenCalled();
  }
);
