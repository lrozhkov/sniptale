// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { CameraCropPreview } from './camera-crop-preview';
import { DEFAULT_CAMERA_APPEARANCE } from '../../../../../features/video/project/camera/appearance';

let container: HTMLDivElement, root: Root;
const load = vi.fn(),
  draw = vi.fn();
const context = {
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  roundRect: vi.fn(),
  clip: vi.fn(),
  drawImage: draw,
};
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(load);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 200,
    bottom: 150,
    width: 200,
    height: 150,
    toJSON() {},
  });
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function props() {
  return {
    url: 'blob:camera',
    sourceTime: 0.5,
    width: 200,
    height: 150,
    appearance: { ...DEFAULT_CAMERA_APPEARANCE, zoom: 2 },
    disabled: false,
    onChange: vi.fn(),
  };
}
function button() {
  return container.querySelector('button')!;
}
function ready() {
  const video = container.querySelector('video')!;
  Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
  Object.defineProperty(video, 'videoHeight', { value: 480, configurable: true });
  act(() => {
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('loadeddata'));
    video.dispatchEvent(new Event('seeked'));
  });
  return video;
}
function pointer(type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  act(() => button().dispatchEvent(event));
}
it('decodes once, previews a drag and commits it once without moving the playhead or reloading', () => {
  const p = props();
  act(() => root.render(<CameraCropPreview {...p} />));
  expect(button().disabled).toBe(true);
  const video = ready();
  expect(video.currentTime).toBe(0.5);
  expect(button().disabled).toBe(false);
  const count = load.mock.calls.length;
  pointer('pointerdown', 100, 75);
  pointer('pointermove', 120, 65);
  expect(p.onChange).not.toHaveBeenCalled();
  expect(button().style.cursor).toBe('grabbing');
  pointer('pointerup', 120, 65);
  expect(p.onChange).toHaveBeenCalledOnce();
  expect(p.onChange).toHaveBeenCalledWith({ ...p.appearance, panX: -0.2, panY: 2 / 15 });
  act(() =>
    root.render(<CameraCropPreview {...p} appearance={{ ...p.appearance, roundness: 50 }} />)
  );
  expect(load.mock.calls.length).toBe(count);
  expect(draw).toHaveBeenCalled();
});
it('cancels pointer edits, supports keyboard and resets a gesture when locked', () => {
  const p = props();
  act(() =>
    root.render(
      <>
        <CameraCropPreview {...p} />
        <input aria-label="Other control" />
      </>
    )
  );
  ready();
  container.querySelector('input')!.focus();
  pointer('pointerdown', 100, 75);
  pointer('pointermove', 120, 65);
  act(() =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
    )
  );
  pointer('pointerup', 120, 65);
  expect(p.onChange).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(button());
  act(() =>
    button().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }))
  );
  expect(p.onChange).toHaveBeenCalledWith({ ...p.appearance, panX: 0.1 });
  p.onChange.mockClear();
  pointer('pointerdown', 100, 75);
  pointer('pointercancel', 100, 75);
  pointer('pointerup', 100, 75);
  expect(p.onChange).not.toHaveBeenCalled();
  pointer('pointerdown', 100, 75);
  act(() => root.render(<CameraCropPreview {...p} disabled />));
  expect(button().disabled).toBe(true);
});
it('keeps failed media recoverable and releases its source when unmounted', () => {
  const p = props();
  act(() => root.render(<CameraCropPreview {...p} />));
  const video = container.querySelector('video')!;
  act(() => video.dispatchEvent(new Event('error')));
  expect(button().disabled).toBe(true);
  const retry = container.querySelectorAll('button')[1]!;
  const count = load.mock.calls.length;
  act(() => retry.click());
  expect(load.mock.calls.length).toBe(count + 1);
  ready();
  expect(button().disabled).toBe(false);
  act(() => root.render(null));
  expect(video.hasAttribute('src')).toBe(false);
});
