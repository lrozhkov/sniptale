// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewPreviewFrame } from './preview-frame';

vi.mock('../../platform/i18n', () => ({ translate: (key: string) => key }));
let host: HTMLDivElement;
let root: Root;
let active: Element | null;
const request = vi.fn();
const exit = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  active = null;
  Object.defineProperties(document, {
    fullscreenElement: { configurable: true, get: () => active },
    fullscreenEnabled: { configurable: true, value: true },
    exitFullscreen: { configurable: true, value: exit },
  });
  Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
    configurable: true,
    value: request,
  });
  request.mockImplementation(() => {
    active = host.querySelector('[data-ui="gallery.videoReview.previewFrame"]');
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  });
  exit.mockImplementation(() => {
    active = null;
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen');
  for (const name of ['fullscreenElement', 'fullscreenEnabled', 'exitFullscreen'])
    Reflect.deleteProperty(document, name);
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
function render(disabled = false, playing = false, duration = 10) {
  const onPlay = vi.fn(),
    onSeek = vi.fn();
  act(() =>
    root.render(
      <ReviewPreviewFrame
        time={2}
        duration={duration}
        playing={playing}
        disabled={disabled}
        onPlay={onPlay}
        onSeek={onSeek}
      >
        {() => <video data-testid="retained-video" />}
      </ReviewPreviewFrame>
    )
  );
  return {
    onPlay,
    onSeek,
    toggle: host.querySelector<HTMLButtonElement>('[data-ui="gallery.videoReview.fullscreen"]')!,
  };
}
it('keeps the original video, seeks/plays through callbacks, and restores trigger focus on exit', async () => {
  const controls = render();
  const video = host.querySelector('video');
  await act(async () => controls.toggle.click());
  expect(active).toBe(host.firstElementChild);
  expect(host.querySelector('video')).toBe(video);
  expect(document.activeElement).toBe(controls.toggle);
  const play = host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.play"]')!;
  act(() => play.click());
  expect(controls.onPlay).toHaveBeenCalledOnce();
  const globalKey = vi.fn();
  window.addEventListener('keydown', globalKey);
  act(() =>
    play.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))
  );
  expect(globalKey).toHaveBeenCalledOnce();
  act(() => play.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
  expect(globalKey).toHaveBeenCalledOnce();
  window.removeEventListener('keydown', globalKey);
  const range = host.querySelector<HTMLInputElement>('input[type="range"]')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(range, '4.5');
    range.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(controls.onSeek).toHaveBeenCalledWith(4.5);
  await act(async () =>
    controls.toggle.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
  );
  expect(active).toBeNull();
  expect(document.activeElement).toBe(controls.toggle);
  expect(host.querySelector('video')).toBe(video);
});
it('reports request failure, dismisses it, and allows retry', async () => {
  request.mockRejectedValueOnce(new Error('denied'));
  const controls = render();
  await act(async () => controls.toggle.click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    'gallery.videoReview.fullscreenFailed'
  );
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.dismissFeedback"]')!
      .click()
  );
  expect(host.querySelector('[role="alert"]')).toBeNull();
  await act(async () => controls.toggle.click());
  expect(active).not.toBeNull();
});
it('keeps unavailable controls inert and removes the fullscreen listener on unmount', async () => {
  const controls = render(true);
  act(() => controls.toggle.click());
  expect(request).not.toHaveBeenCalled();
  const remove = vi.spyOn(document, 'removeEventListener');
  act(() => root.render(null));
  expect(remove).toHaveBeenCalledWith('fullscreenchange', expect.any(Function));
  remove.mockRestore();
});

it('keeps exit available while a fullscreen transport becomes busy', async () => {
  const controls = render();
  await act(async () => controls.toggle.click());
  render(true, true, 0);
  expect(
    host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.pause"]')!.disabled
  ).toBe(true);
  expect(host.querySelector<HTMLInputElement>('input')!.disabled).toBe(true);
  expect(controls.toggle.disabled).toBe(false);
  await act(async () => controls.toggle.click());
  expect(active).toBeNull();
});
