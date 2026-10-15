// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ReviewSourceCropEditor } from './source-crop-editor';
import { translate } from '../../platform/i18n';

const preview = vi.hoisted(() => ({ failed: false, retry: vi.fn() }));
vi.mock('./use-zoom-preview-source', () => ({
  useZoomPreviewSource: () => ({}),
  useZoomPreviewFrame: () => ({
    frame: preview.failed ? null : { image: document.createElement('canvas') },
    status: preview.failed ? 'failed' : 'ready',
    retry: preview.retry,
  }),
}));
afterEach(() => {
  preview.failed = false;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    vi.fn().mockReturnValue({
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
    })
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const apply = vi.fn(),
    cancel = vi.fn();
  act(() =>
    root.render(
      <ReviewSourceCropEditor
        file={new File(['video'], 'source.webm')}
        source={{ width: 1920, height: 1080 }}
        sourceTime={2}
        canvas={{ width: 1920, height: 1080, crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } }}
        onApply={apply}
        onCancel={cancel}
      />
    )
  );
  const canvas = host.querySelector('canvas')!;
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 480, 270));
  Object.defineProperties(canvas, {
    setPointerCapture: { value: vi.fn() },
    hasPointerCapture: { value: () => true },
    releasePointerCapture: { value: vi.fn() },
  });
  const button = (key: Parameters<typeof translate>[0]) => {
    const found = Array.from(host.querySelectorAll('button')).find(
      (node) => node.textContent === translate(key)
    );
    if (!found) throw new Error(`Missing crop control: ${key}`);
    act(() => found.click());
  };
  const pointer = (type: string, x: number, y: number, id = 1) =>
    act(() => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
      Object.defineProperty(event, 'pointerId', { value: id });
      canvas.dispatchEvent(event);
    });
  return {
    host,
    canvas,
    apply,
    cancel,
    button,
    pointer,
    dispose: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

it('commits one bounded crop after pointer and keyboard editing and discards cancelled gestures', () => {
  const ui = mount();
  try {
    ui.pointer('pointerdown', 1, 1);
    ui.pointer('pointermove', 10, 10);
    ui.pointer('pointerdown', 240, 135);
    ui.pointer('pointermove', 288, 162, 2);
    ui.pointer('pointermove', 288, 162);
    ui.pointer('pointerup', 288, 162);
    for (const key of ['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'Tab']) {
      act(() =>
        ui.canvas.dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true, shiftKey: key === 'ArrowUp' })
        )
      );
    }
    ui.button('gallery.videoReview.sourceCropApply');
    expect(ui.apply).toHaveBeenCalledTimes(1);
    expect(ui.apply.mock.lastCall?.[0]).toMatchObject({ x: 0.35, width: 0.5, height: 0.5 });
    expect(ui.apply.mock.lastCall?.[0].y).toBeCloseTo(0.35 - 9 / 1080);
    ui.button('gallery.videoReview.sourceCropReset');
    ui.pointer('pointerdown', 479, 269);
    ui.pointer('pointermove', 359, 201);
    ui.pointer('pointercancel', 359, 201);
    ui.pointer('pointerdown', 479, 269);
    ui.pointer('pointermove', 359, 201);
    ui.pointer('lostpointercapture', 359, 201);
    ui.button('gallery.videoReview.sourceCropApply');
    expect(ui.apply.mock.lastCall?.[0]).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    ui.pointer('pointerdown', 479, 269);
    ui.pointer('pointermove', 359, 201);
    ui.pointer('pointerup', 359, 201);
    ui.button('gallery.videoReview.sourceCropApply');
    expect(ui.apply.mock.lastCall?.[0]).toEqual({
      x: 0,
      y: 0,
      width: expect.closeTo(0.75, 10),
      height: expect.closeTo(0.75, 10),
    });
    const input = ui.host.querySelector('input')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '50');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    ui.button('gallery.videoReview.sourceCropApply');
    expect(ui.apply.mock.lastCall?.[0]).toEqual({
      x: expect.closeTo(0.125, 10),
      y: expect.closeTo(0.125, 10),
      width: 0.5,
      height: 0.5,
    });
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(ui.cancel).toHaveBeenCalledTimes(1);
    ui.button('common.actions.cancel');
    expect(ui.cancel).toHaveBeenCalledTimes(2);
  } finally {
    ui.dispose();
  }
});

it('offers frame retry without committing or losing the existing crop', () => {
  preview.failed = true;
  const ui = mount();
  try {
    expect(ui.host.querySelector('[role=status]')?.textContent).toBe(
      translate('gallery.videoReview.previewFailed')
    );
    ui.pointer('pointerdown', 240, 135);
    ui.pointer('pointermove', 288, 162);
    ui.button('gallery.videoReview.retry');
    expect(preview.retry).toHaveBeenCalledOnce();
    expect(ui.apply).not.toHaveBeenCalled();
    ui.button('gallery.videoReview.sourceCropApply');
    expect(ui.apply).toHaveBeenCalledWith({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
  } finally {
    ui.dispose();
  }
});
