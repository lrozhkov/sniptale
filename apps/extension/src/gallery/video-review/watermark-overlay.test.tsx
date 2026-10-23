// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewWatermarkOverlay } from './watermark-overlay';
import { createQuickEditWatermark } from '../../features/video/project/scene/watermark';
const io = vi.hoisted(() => ({ prepare: vi.fn(), draw: vi.fn(), dispose: vi.fn() }));
vi.mock('../../features/video/composition/canvas/watermark', () => ({
  createWatermarkRenderer: io.prepare,
}));
vi.mock('../../platform/i18n', () => ({
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));
let root: Root;
let host: HTMLDivElement;
let props: Parameters<typeof ReviewWatermarkOverlay>[0];
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  props = {
    settings: { ...createQuickEditWatermark('Saved'), mode: 'text' },
    output: { width: 1000, height: 500 },
    editable: true,
    onPreview: vi.fn(),
    onChange: vi.fn(),
    onError: vi.fn(),
  };
  io.prepare.mockResolvedValue({
    bounds: { x: 790, y: 440, width: 200, height: 50 },
    draw: io.draw,
    dispose: io.dispose,
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => root.render(<ReviewWatermarkOverlay {...props} />));
}
function pointer(element: Element, name: string, x: number, y: number) {
  const event = new MouseEvent(name, { bubbles: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  act(() => element.dispatchEvent(event));
}
function button() {
  const node = host.querySelector('button')!;
  node.setPointerCapture = vi.fn();
  node.releasePointerCapture = vi.fn();
  node.hasPointerCapture = () => true;
  vi.spyOn(host.firstElementChild!, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 500,
    height: 250,
  } as DOMRect);
  return node;
}
it('draws at output resolution and does not reacquire when only callbacks or placement change', async () => {
  await render();
  expect(host.querySelector('canvas')!.width).toBe(1000);
  props = {
    ...props,
    onChange: vi.fn(),
    settings: {
      ...props.settings!,
      placement: { ...props.settings!.placement, position: { x: 0.4, y: 0.5 } },
    },
  };
  await render();
  expect(io.prepare).toHaveBeenCalledOnce();
});
it('previews a drag locally and commits exactly once on pointerup', async () => {
  await render();
  const node = button();
  pointer(node, 'pointerdown', 440, 230);
  pointer(node, 'pointermove', 240, 130);
  pointer(node, 'pointermove', 140, 100);
  expect(props.onChange).not.toHaveBeenCalled();
  expect(props.onPreview).toHaveBeenCalled();
  pointer(node, 'pointerup', 140, 100);
  expect(props.onChange).toHaveBeenCalledOnce();
  expect(io.prepare).toHaveBeenCalledOnce();
  expect(props.onPreview).toHaveBeenLastCalledWith(null);
});
it('Escape cancels an in-progress drag without a history change', async () => {
  await render();
  const node = button();
  pointer(node, 'pointerdown', 440, 230);
  pointer(node, 'pointermove', 200, 100);
  act(() => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  pointer(node, 'pointerup', 200, 100);
  expect(props.onChange).not.toHaveBeenCalled();
  expect(props.onPreview).toHaveBeenLastCalledWith(null);
});
it('disposes a stale asynchronous resource instead of drawing it after replacement', async () => {
  let finish!: (value: {
    bounds: { x: number; y: number; width: number; height: number };
    draw: () => void;
    dispose: () => void;
  }) => void;
  io.prepare.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await render();
  props = {
    ...props,
    settings: { ...props.settings!, text: { ...props.settings!.text, value: 'Changed' } },
  };
  await render();
  const stale = { bounds: { x: 0, y: 0, width: 10, height: 10 }, draw: vi.fn(), dispose: vi.fn() };
  await act(async () => finish(stale));
  expect(stale.dispose).toHaveBeenCalledOnce();
  expect(stale.draw).not.toHaveBeenCalled();
});
it('provides keyboard placement and no drag target for tiled output', async () => {
  await render();
  const node = button();
  act(() => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
  expect(props.onChange).toHaveBeenCalledOnce();
  props = { ...props, settings: { ...props.settings!, layout: 'tiled' } };
  await render();
  expect(host.querySelector('button')).toBeNull();
});
it('reports resource failure and leaves no invisible interactive target', async () => {
  io.prepare.mockRejectedValueOnce(new Error('private error'));
  await render();
  expect(props.onError).toHaveBeenLastCalledWith('gallery.videoReview.watermarkRenderFailed');
  expect(host.querySelector('button')).toBeNull();
});
it('pointer cancellation restores preview without committing and read-only output has no hitbox', async () => {
  await render();
  const node = button();
  pointer(node, 'pointerdown', 440, 230);
  pointer(node, 'pointermove', 200, 100);
  pointer(node, 'pointercancel', 200, 100);
  expect(props.onChange).not.toHaveBeenCalled();
  expect(props.onPreview).toHaveBeenLastCalledWith(null);
  props = { ...props, editable: false };
  await render();
  expect(host.querySelector('button')).toBeNull();
});

it('retries unchanged settings explicitly and reports readiness only after successful preparation', async () => {
  props = { ...props, retryGeneration: 0, onReady: vi.fn() };
  io.prepare
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockRejectedValueOnce(new Error('Still unavailable'));
  await render();
  expect(props.onReady).not.toHaveBeenCalled();
  props = { ...props, retryGeneration: 1 };
  await render();
  expect(io.prepare).toHaveBeenCalledTimes(2);
  expect(props.onError).toHaveBeenLastCalledWith('gallery.videoReview.watermarkRenderFailed');
  expect(props.onReady).not.toHaveBeenCalled();
  props = { ...props, retryGeneration: 2 };
  await render();
  expect(io.prepare).toHaveBeenCalledTimes(3);
  expect(props.onReady).toHaveBeenCalledOnce();
  expect(props.onError).toHaveBeenLastCalledWith(null);
  expect(props.onChange).not.toHaveBeenCalled();
  expect(props.onPreview).not.toHaveBeenCalled();
});

it('ignores a stale retry completion and never announces its readiness', async () => {
  let finish!: (value: {
    bounds: { x: number; y: number; width: number; height: number };
    draw: () => void;
    dispose: () => void;
  }) => void;
  io.prepare.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  props = { ...props, retryGeneration: 0, onReady: vi.fn() };
  await render();
  props = { ...props, retryGeneration: 1 };
  await render();
  expect(props.onReady).toHaveBeenCalledOnce();
  const stale = { bounds: { x: 0, y: 0, width: 10, height: 10 }, draw: vi.fn(), dispose: vi.fn() };
  await act(async () => finish(stale));
  expect(stale.dispose).toHaveBeenCalledOnce();
  expect(stale.draw).not.toHaveBeenCalled();
  expect(props.onReady).toHaveBeenCalledOnce();
});

it('keeps focus inside the editor when playback removes its focused watermark handle', async () => {
  await render();
  const node = button();
  node.focus();
  expect(document.activeElement).toBe(node);
  props = { ...props, editable: false };
  await render();
  expect(host.querySelector('button')).toBeNull();
  expect(document.activeElement).toBe(host.firstElementChild);
  expect(host.contains(document.activeElement)).toBe(true);
  expect(host.firstElementChild).toHaveProperty('tabIndex', -1);
  expect(props.onChange).not.toHaveBeenCalled();
});

it('does not steal focus from another control when the watermark handle disappears', async () => {
  await render();
  const other = document.createElement('button');
  document.body.append(other);
  try {
    button().focus();
    other.focus();
    props = { ...props, editable: false };
    await render();
    expect(host.querySelector('button')).toBeNull();
    expect(document.activeElement).toBe(other);
  } finally {
    other.remove();
  }
});

it('cancels a placement draft when output dimensions change without committing it', async () => {
  await render();
  const node = button();
  pointer(node, 'pointerdown', 440, 230);
  pointer(node, 'pointermove', 200, 100);
  props = { ...props, output: { width: 1920, height: 1080 } };
  await render();
  expect(props.onPreview).toHaveBeenLastCalledWith(null);
  expect(props.onChange).not.toHaveBeenCalled();
  expect(io.prepare).toHaveBeenCalledTimes(2);
  expect(host.querySelector('canvas')!.width).toBe(1920);
  expect(host.querySelector('canvas')!.height).toBe(1080);
  pointer(button(), 'pointerup', 200, 100);
  expect(props.onChange).not.toHaveBeenCalled();
});

it('uses manual renderer bounds for the same handle without preparing or painting duplicate pixels', async () => {
  props.manual = { bounds: { x: 790, y: 440, width: 200, height: 50 } };
  await render();
  expect(io.prepare).not.toHaveBeenCalled();
  expect(io.draw).not.toHaveBeenCalled();
  expect(host.querySelector('canvas')).toBeNull();
  const handle = button();
  expect(handle.style.width).toBe('20%');
  pointer(handle, 'pointerdown', 850, 450);
  pointer(handle, 'pointermove', 800, 400);
  expect(props.onPreview).toHaveBeenCalled();
  pointer(handle, 'pointercancel', 800, 400);
  expect(props.onPreview).toHaveBeenLastCalledWith(null);
  expect(props.onChange).not.toHaveBeenCalled();
});
