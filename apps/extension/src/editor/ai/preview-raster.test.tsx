// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ImagePreviewRaster, type ImageComparisonMode } from './preview-raster';

const image = { dataUrl: 'data:image/png;base64,result', width: 400, height: 200 };
let host: HTMLDivElement, root: Root;
let mode: ImageComparisonMode, original: boolean;
const zoomed = vi.fn();
function Viewer() {
  const [zoom, setZoom] = useState<number | null>(null);
  return (
    <ImagePreviewRaster
      image={image}
      original={original ? { ...image, dataUrl: 'data:image/png;base64,original' } : null}
      label="Raster"
      imageKey="result"
      frame={{ width: 400, height: 200 }}
      comparison={mode}
      zoom={zoom}
      onZoom={(next) => {
        zoomed(next);
        setZoom(next);
      }}
    />
  );
}
const viewport = () => host.querySelector<HTMLElement>('[data-ui="editor.ai.preview.viewport"]')!;
const slider = () => host.querySelector<HTMLElement>('[data-ui="editor.ai.preview.divider"]')!;
const raster = () => host.querySelector('[data-ui="editor.ai.preview-image"]')!;
async function render() {
  await act(async () => root.render(<Viewer />));
}
async function pointer(
  type: string,
  options: MouseEventInit & { pointerId?: number; pointerType?: string } = {}
) {
  await act(async () => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...options });
    Object.defineProperties(event, {
      pointerId: { value: options.pointerId ?? 1 },
      pointerType: { value: options.pointerType ?? 'mouse' },
    });
    viewport().dispatchEvent(event);
  });
}
async function key(key: string, shiftKey = false) {
  await act(async () =>
    slider().dispatchEvent(
      new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })
    )
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(200);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100);
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(200);
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(100);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(10, 20, 200, 100)
  );
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: { configurable: true, value: vi.fn() },
    hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
    releasePointerCapture: { configurable: true, value: vi.fn() },
  });
  mode = 'split';
  original = true;
  zoomed.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const name of ['setPointerCapture', 'hasPointerCapture', 'releasePointerCapture'])
    Reflect.deleteProperty(HTMLElement.prototype, name);
});

it('moves the comparison by hover, captured touch and keyboard while clamping its edges', async () => {
  await render();
  await pointer('pointermove', { clientX: 60 });
  expect(slider().getAttribute('aria-valuenow')).toBe('25');
  await pointer('pointerdown', { clientX: 110, pointerType: 'touch' });
  await pointer('pointermove', { clientX: 300, buttons: 1, pointerType: 'touch' });
  expect(slider().getAttribute('aria-valuenow')).toBe('100');
  await pointer('pointerup');
  expect(viewport().releasePointerCapture).toHaveBeenCalledWith(1);
  await key('Home');
  expect(slider().getAttribute('aria-valuenow')).toBe('0');
  await key('End');
  await key('ArrowLeft');
  expect(slider().getAttribute('aria-valuenow')).toBe('99');
  await key('ArrowLeft', true);
  expect(slider().getAttribute('aria-valuenow')).toBe('89');
  await key('ArrowRight', true);
  expect(slider().getAttribute('aria-valuenow')).toBe('99');
  await key('Enter');
  expect(slider().getAttribute('aria-valuenow')).toBe('99');
  await pointer('pointerdown', { clientX: 100 });
  await act(async () => window.dispatchEvent(new Event('blur')));
  expect(viewport().releasePointerCapture).toHaveBeenCalled();
  await pointer('pointermove', { clientX: -100 });
  expect(slider().getAttribute('aria-valuenow')).toBe('0');
});

it('pans with Shift or the middle button and cancels gestures without changing the comparison', async () => {
  await render();
  await pointer('pointerdown', { clientX: 100, clientY: 80, shiftKey: true });
  await pointer('pointermove', { clientX: 80, clientY: 60, buttons: 1 });
  expect(viewport().scrollLeft).toBe(20);
  expect(viewport().scrollTop).toBe(20);
  await pointer('pointerup');
  await pointer('pointerdown', { button: 2 });
  expect(slider().getAttribute('aria-valuenow')).toBe('50');
  await pointer('pointerdown', { button: 1 });
  await pointer('pointercancel');
  await pointer('pointerdown');
  await pointer('lostpointercapture');
  await pointer('pointerup', { pointerId: 9 });
  mode = 'none';
  await render();
  await pointer('pointerdown', { clientX: 100 });
  await pointer('pointermove', { clientX: 90, buttons: 1 });
  await pointer('pointerup');
  expect(host.querySelector('[data-ui="editor.ai.preview.divider"]')).toBeNull();
});

it('zooms around the wheel pointer and renders an adjustable opacity independently from split mode', async () => {
  mode = 'opacity';
  await render();
  const opacity = host.querySelector<HTMLInputElement>('input[type="range"]')!;
  expect(raster().getAttribute('opacity')).toBe('0.5');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(opacity, '25');
    opacity.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(raster().getAttribute('opacity')).toBe('0.25');
  for (const [deltaY, deltaMode] of [
    [0, 0],
    [-100, 0],
    [2, 1],
    [1, 2],
    [-10000, 0],
    [10000, 0],
  ] as const) {
    await act(async () =>
      viewport().dispatchEvent(
        new WheelEvent('wheel', { deltaY, deltaMode, clientX: 100, clientY: 50, cancelable: true })
      )
    );
  }
  expect(zoomed).toHaveBeenCalledTimes(5);
  expect(zoomed.mock.calls.every(([zoom]) => zoom >= 0.1 && zoom <= 8)).toBe(true);
  mode = 'split';
  original = false;
  await render();
  expect(host.querySelector('[role="slider"]')).toBeNull();
  expect(raster().getAttribute('clip-path')).toBeNull();
  expect(raster().getAttribute('opacity')).toBe('1');
});
