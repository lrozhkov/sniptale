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

it('keeps transport feedback and audio settings in sync with media events', () => {
  const video = mount();
  act(() => video.dispatchEvent(new Event('play')));
  expect(button('pause')).not.toBeNull();
  act(() => video.dispatchEvent(new Event('waiting')));
  expect(host.querySelector('[data-ui="gallery.preview.player"]')?.getAttribute('aria-busy')).toBe(
    'true'
  );
  act(() => video.dispatchEvent(new Event('playing')));
  expect(host.querySelector('[data-ui="gallery.preview.player"]')?.getAttribute('aria-busy')).toBe(
    'false'
  );
  act(() => video.dispatchEvent(new Event('ended')));
  expect(button('play')).not.toBeNull();

  act(() => button('mute').click());
  act(() => video.dispatchEvent(new Event('volumechange')));
  expect(video.muted).toBe(true);
  expect(button('unmute')).not.toBeNull();
  const volume = host.querySelector<HTMLInputElement>(
    '[aria-label="gallery.preview.player.volume"]'
  )!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(volume, '0.5');
    volume.dispatchEvent(new Event('input', { bubbles: true }));
    volume.dispatchEvent(new Event('change', { bubbles: true }));
    video.dispatchEvent(new Event('volumechange'));
  });
  expect(video.volume).toBe(0.5);
  expect(video.muted).toBe(false);
  const speed = host.querySelector<HTMLSelectElement>(
    '[aria-label="gallery.preview.player.speed"]'
  )!;
  act(() => {
    speed.value = '1.5';
    speed.dispatchEvent(new Event('change', { bubbles: true }));
    video.dispatchEvent(new Event('ratechange'));
  });
  expect(video.playbackRate).toBe(1.5);
  expect(speed.value).toBe('1.5');
});

it('keeps hover decoding separate from playback and disables seeking after media errors', () => {
  const video = mount();
  video.currentTime = 7;
  const seek = host.querySelector<HTMLInputElement>('[aria-label="gallery.preview.player.seek"]')!;
  vi.spyOn(seek, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 10));
  act(() => seek.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 50 })));
  expect(host.querySelector('[data-ui="gallery.preview.player.framePopover"]')).not.toBeNull();
  expect(video.currentTime).toBe(7);
  act(() => video.dispatchEvent(new Event('error')));
  expect(seek.disabled).toBe(true);
  expect(host.querySelector('[data-ui="gallery.preview.player.framePopover"]')).toBeNull();
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
    seek.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(seek, '12');
    seek.dispatchEvent(new Event('input', { bubbles: true }));
    seek.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(video.currentTime).toBe(12);
  expect(host.querySelector('[data-sample-time="12"]')).not.toBeNull();
  act(() => seek.blur());
  expect(host.querySelector('[data-ui="gallery.preview.player.framePopover"]')).toBeNull();
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

it('labels the displayed frame with its own sampled time and keeps feedback dimensions stable', () => {
  act(() => root.render(<VideoThumbnail snapshot={{ sampleTime: 4, status: 'loading' }} />));
  expect(host.querySelector('[data-sample-time="4"]')?.textContent).toContain('0:04');
  const frameBox = host.querySelector('[data-ui="gallery.preview.player.frame"] > div');
  expect(frameBox?.className).toContain('aspect-video');
  act(() =>
    root.render(
      <VideoThumbnail
        snapshot={{
          sampleTime: 9,
          status: 'ready',
          dataUrl: 'data:image/jpeg;base64,YQ==',
        }}
      />
    )
  );
  expect(host.querySelector('[data-sample-time="9"] img')?.getAttribute('src')).toContain(
    'data:image/jpeg'
  );
  expect(host.querySelector('[data-sample-time="9"]')?.textContent).toContain('0:09');
  act(() => root.render(<VideoThumbnail snapshot={{ sampleTime: 9, status: 'error' }} />));
  expect(host.querySelector('[role="status"]')?.textContent).toContain('frameFailed');
  expect(host.querySelector('[data-sample-time="9"] img')).toBeNull();
});

it('clamps the hover frame to the player at both timeline edges', () => {
  mount();
  const player = host.querySelector<HTMLElement>('[data-ui="gallery.preview.player"]')!;
  const timeline = host.querySelector<HTMLElement>('[data-ui="gallery.preview.player.timeline"]')!;
  const seek = host.querySelector<HTMLInputElement>('[aria-label="gallery.preview.player.seek"]')!;
  vi.spyOn(player, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 300, 250));
  vi.spyOn(timeline, 'getBoundingClientRect').mockReturnValue(new DOMRect(110, 300, 280, 24));
  vi.spyOn(seek, 'getBoundingClientRect').mockReturnValue(new DOMRect(110, 300, 280, 24));
  const popupRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
  popupRect.mockImplementation(function (this: HTMLElement) {
    return this.dataset['ui'] === 'gallery.preview.player.framePopover'
      ? new DOMRect(0, 0, 192, 130)
      : new DOMRect();
  });

  act(() => seek.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 112 })));
  const popup = host.querySelector<HTMLElement>('[data-ui="gallery.preview.player.framePopover"]')!;
  expect(popup.style.left).toBe('-10px');
  expect(popup.style.top).toBe('-138px');

  act(() => seek.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 388 })));
  expect(popup.style.left).toBe('98px');
  expect(popup.querySelector('[data-sample-time]')).not.toBeNull();

  act(() => timeline.dispatchEvent(new MouseEvent('pointerout', { bubbles: true })));
  expect(host.querySelector('[data-ui="gallery.preview.player.framePopover"]')).toBeNull();
  act(() => seek.focus());
  expect(host.querySelector('[data-ui="gallery.preview.player.framePopover"]')).not.toBeNull();
  act(() => timeline.dispatchEvent(new MouseEvent('pointerout', { bubbles: true })));
  expect(host.querySelector('[data-ui="gallery.preview.player.framePopover"]')).not.toBeNull();
});
