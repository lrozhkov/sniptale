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

it('moves the camera center by pointer with clamped bounds', async () => {
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
  await pointer(canvas, 'pointerdown', 120, 67.5);
  // Pointer movement is local until release: cancel never writes a persisted edit.
  expect(onChange).not.toHaveBeenCalled();
  await pointer(canvas, 'pointermove', 9999, -50);
  expect(onChange).not.toHaveBeenCalled();
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
