// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
  region?: QuickEditZoomRegion;
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
