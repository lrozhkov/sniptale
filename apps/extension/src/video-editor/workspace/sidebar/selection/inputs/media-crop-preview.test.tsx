// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { MediaCropPreview } from './media-crop-preview';
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 200,
    bottom: 100,
    width: 200,
    height: 100,
    toJSON() {},
  });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function props() {
  return {
    url: 'blob:source',
    kind: 'VIDEO' as const,
    width: 400,
    height: 200,
    sourceTime: 1,
    crop: { x: 0.25, y: 0.1, width: 0.5, height: 0.8 },
    disabled: false,
    onChange: vi.fn(),
  };
}
function pointer(type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  act(() => container.querySelector('button')!.dispatchEvent(event));
}
it('retains one decoder across source seeks and crop edits, including late metadata', () => {
  const p = props();
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load');
  act(() => root.render(<MediaCropPreview {...p} />));
  const video = container.querySelector('video')!;
  act(() => root.render(<MediaCropPreview {...p} sourceTime={2} />));
  act(() => video.dispatchEvent(new Event('loadedmetadata')));
  expect(video.currentTime).toBe(2);
  Object.defineProperty(video, 'readyState', { value: 2, configurable: true });
  act(() => video.dispatchEvent(new Event('loadeddata')));
  act(() => root.render(<MediaCropPreview {...p} sourceTime={3} crop={{ ...p.crop, x: 0.3 }} />));
  expect(container.querySelector('video')).toBe(video);
  expect(video.currentTime).toBe(3);
  expect(load).not.toHaveBeenCalled();
});
it('commits a drag once and cancels Escape, capture loss and disabled editing', () => {
  const p = props();
  act(() => root.render(<MediaCropPreview {...p} />));
  act(() => container.querySelector('video')!.dispatchEvent(new Event('loadeddata')));
  pointer('pointerdown', 50, 20);
  pointer('pointermove', 70, 30);
  expect(p.onChange).not.toHaveBeenCalled();
  pointer('pointerup', 70, 30);
  expect(p.onChange).toHaveBeenCalledOnce();
  expect(p.onChange.mock.calls[0]![0].x).toBeCloseTo(0.35, 9);
  expect(p.onChange.mock.calls[0]![0].y).toBeCloseTo(0.2, 9);
  p.onChange.mockClear();
  pointer('pointerdown', 50, 20);
  pointer('pointermove', 80, 30);
  act(() =>
    container
      .querySelector('button')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
  pointer('pointerup', 80, 30);
  expect(p.onChange).not.toHaveBeenCalled();
  pointer('pointerdown', 50, 20);
  pointer('pointermove', 80, 30);
  pointer('lostpointercapture', 80, 30);
  pointer('pointerup', 80, 30);
  expect(p.onChange).not.toHaveBeenCalled();
  pointer('pointerdown', 50, 20);
  pointer('pointermove', 80, 30);
  act(() => root.render(<MediaCropPreview {...p} disabled />));
  pointer('pointerup', 80, 30);
  expect(p.onChange).not.toHaveBeenCalled();
});
it('supports image keyboard editing and retains metadata on decode failure', () => {
  const p = props();
  act(() => root.render(<MediaCropPreview {...p} kind="IMAGE" />));
  const image = container.querySelector('img')!;
  act(() => image.dispatchEvent(new Event('load')));
  const button = container.querySelector('button')!;
  act(() =>
    button.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true })
    )
  );
  expect(p.onChange).toHaveBeenCalledExactlyOnceWith({ ...p.crop, x: 0.251 });
  p.onChange.mockClear();
  act(() => image.dispatchEvent(new Event('error')));
  expect(button.disabled).toBe(true);
  expect(p.onChange).not.toHaveBeenCalled();
  expect(container.querySelectorAll('button')).toHaveLength(2);
});
