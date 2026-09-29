// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PreviewVideo } from './video-player';
import { VideoThumbnail } from './video-thumbnail';

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function mount() {
  act(() => root.render(<PreviewVideo src="blob:clip" />));
  const video = host.querySelector('video')!;
  Object.defineProperty(video, 'duration', { configurable: true, value: 30 });
  act(() => video.dispatchEvent(new Event('loadedmetadata')));
  return video;
}
function button(name: string) {
  return host.querySelector<HTMLButtonElement>(`[aria-label="gallery.preview.player.${name}"]`)!;
}

it('suppresses browser video download affordances in Trash while keeping playback controls', () => {
  act(() => root.render(<PreviewVideo src="blob:clip" trashMode />));
  const video = host.querySelector('video')!;
  expect(video.getAttribute('controlslist')).toBe('nodownload');
  const contextMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  act(() => video.dispatchEvent(contextMenu));
  expect(contextMenu.defaultPrevented).toBe(true);
  expect(button('play')).not.toBeNull();
});

it('plays, reports rejection and retains usable controls for retry', async () => {
  mount();
  const play = vi
    .spyOn(HTMLMediaElement.prototype, 'play')
    .mockRejectedValueOnce(new Error('blocked'))
    .mockResolvedValueOnce();
  await act(async () => button('play').click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('actionFailed');
  await act(async () => button('play').click());
  expect(play).toHaveBeenCalledTimes(2);
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it('keeps hover decoding separate from playback and disables seeking after media errors', () => {
  const video = mount();
  video.currentTime = 7;
  const seek = host.querySelector<HTMLInputElement>('[aria-label="gallery.preview.player.seek"]')!;
  vi.spyOn(seek, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 10));
  act(() => seek.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 50 })));
  expect(host.querySelector('canvas')).not.toBeNull();
  expect(video.currentTime).toBe(7);
  act(() => video.dispatchEvent(new Event('error')));
  expect(seek.disabled).toBe(true);
  expect(host.querySelector('canvas')).toBeNull();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('player.failed');
});

it('switches fit to intrinsic size and seeks through the native range', () => {
  const video = mount();
  const select = host.querySelector<HTMLSelectElement>(
    '[aria-label="gallery.preview.player.scale"]'
  )!;
  act(() => {
    select.value = 'original';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(video.className).toContain('max-w-none');
  const seek = host.querySelector<HTMLInputElement>('[aria-label="gallery.preview.player.seek"]')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(seek, '12');
    seek.dispatchEvent(new Event('input', { bubbles: true }));
    seek.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(video.currentTime).toBe(12);
});

it('requests fullscreen on the controls container and handles failure', async () => {
  mount();
  const player = host.querySelector<HTMLElement>('[data-ui="gallery.preview.player"]')!;
  const request = vi.fn().mockRejectedValue(new Error('denied'));
  Object.defineProperty(player, 'requestFullscreen', { value: request });
  await act(async () => button('fullscreen').click());
  expect(request).toHaveBeenCalledOnce();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('actionFailed');
});

it('owns fullscreen Escape and restores focus after fullscreenchange', async () => {
  mount();
  const player = host.querySelector<HTMLElement>('[data-ui="gallery.preview.player"]')!;
  const exit = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: player });
  act(() => document.dispatchEvent(new Event('fullscreenchange')));
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  await act(async () => button('exitFullscreen').dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  expect(exit).toHaveBeenCalledOnce();
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
  act(() => document.dispatchEvent(new Event('fullscreenchange')));
  expect(document.activeElement).toBe(button('fullscreen'));
});

it('disposes obsolete frame decoding and hides stale frames while the next request loads', () => {
  vi.useFakeTimers();
  const create = document.createElement.bind(document);
  const decoders: HTMLVideoElement[] = [];
  vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
    const node = create(tag, options);
    if (node instanceof HTMLVideoElement) decoders.push(node);
    return node;
  });
  const draw = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: draw,
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  act(() => root.render(<VideoThumbnail src="blob:clip" time={4} />));
  act(() => vi.advanceTimersByTime(120));
  const first = decoders[0]!;
  for (const [key, value] of Object.entries({
    readyState: 2,
    videoWidth: 1280,
    videoHeight: 720,
    duration: 30,
  }))
    Object.defineProperty(first, key, { value });
  act(() => first.dispatchEvent(new Event('loadeddata')));
  expect(first.currentTime).toBe(4);
  act(() => first.dispatchEvent(new Event('seeked')));
  expect(draw).toHaveBeenCalledOnce();
  expect(host.querySelector('canvas')?.hidden).toBe(false);
  act(() => root.render(<VideoThumbnail src="blob:clip" time={9} />));
  expect(first.hasAttribute('src')).toBe(false);
  expect(host.querySelector('canvas')?.hidden).toBe(true);
  act(() => first.dispatchEvent(new Event('seeked')));
  expect(draw).toHaveBeenCalledOnce();
  act(() => vi.advanceTimersByTime(8000));
  expect(host.textContent).toContain('frameFailed');
});
