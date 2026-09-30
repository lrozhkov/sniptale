// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PreviewVideo } from './video-player';
import { VideoThumbnail } from './video-thumbnail';

vi.mock('../../platform/i18n', () => ({
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
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
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
  Object.defineProperty(video, 'volume', { configurable: true, writable: true, value: 1 });
  act(() => video.dispatchEvent(new Event('loadedmetadata')));
  act(() => video.dispatchEvent(new Event('volumechange')));
  return video;
}
function button(name: string) {
  return host.querySelector<HTMLButtonElement>(`[aria-label="gallery.preview.player.${name}"]`)!;
}

it('uses app menus for speed and size while retaining their current values', () => {
  mount();
  expect(host.querySelector('select[aria-label="gallery.preview.player.speed"]')).toBeNull();
  expect(host.querySelector('select[aria-label="gallery.preview.player.scale"]')).toBeNull();
  expect(button('speed').textContent).toContain('1×');
  expect(button('scale').textContent).toContain('gallery.preview.player.fit');
});

it('keeps transport, seek and settings in one responsive control row', () => {
  mount();
  const row = host.querySelector('[data-ui="gallery.preview.player.controls-row"]');
  const seek = host.querySelector<HTMLInputElement>('[aria-label="gallery.preview.player.seek"]');
  expect(row?.contains(button('play'))).toBe(true);
  expect(row?.contains(seek ?? null)).toBe(true);
  expect(row?.contains(button('speed'))).toBe(true);
  expect(seek?.className).toContain('sniptale-video-seek');
});

it('keeps menus in fullscreen and lets menu Escape close only the menu', async () => {
  mount();
  const player = host.querySelector<HTMLElement>('[data-ui="gallery.preview.player"]')!;
  const exit = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: player });
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });
  act(() => button('speed').click());
  const menu = player.querySelector<HTMLElement>('[role="listbox"]');
  expect(menu).not.toBeNull();
  const option = menu?.querySelector<HTMLButtonElement>('[role="option"]');
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  act(() => option?.dispatchEvent(escape));
  expect(escape.defaultPrevented).toBe(true);
  expect(exit).not.toHaveBeenCalled();
  expect(player.querySelector('[role="listbox"]')).toBeNull();
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
});

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
    'input[aria-label="gallery.preview.player.volume"]'
  )!;
  expect(Number(volume.value)).toBe(0);
  expect(volume.getAttribute('aria-valuetext')).toBe('0%');
  expect(
    host.querySelector('[data-ui="gallery.preview.player.volumeGroup"]')?.textContent
  ).toContain('0%');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(volume, '0.5');
    volume.dispatchEvent(new Event('input', { bubbles: true }));
    volume.dispatchEvent(new Event('change', { bubbles: true }));
    video.dispatchEvent(new Event('volumechange'));
  });
  expect(video.volume).toBe(0.5);
  expect(video.muted).toBe(false);
  expect(volume.getAttribute('aria-valuetext')).toBe('50%');
  expect(
    host.querySelector('[data-ui="gallery.preview.player.volumeGroup"]')?.textContent
  ).toContain('50%');
  const speed = button('speed');
  act(() => {
    speed.click();
  });
  const faster = [
    ...document.querySelectorAll<HTMLButtonElement>('[role="listbox"] [role="option"]'),
  ].find((option) => option.textContent?.includes('1.5×'));
  act(() => {
    faster?.click();
    video.dispatchEvent(new Event('ratechange'));
  });
  expect(video.playbackRate).toBe(1.5);
  expect(speed.textContent).toContain('1.5×');
});

it('distinguishes zero volume from mute and mirrors external volume changes', () => {
  const video = mount();
  const volume = host.querySelector<HTMLInputElement>(
    'input[aria-label="gallery.preview.player.volume"]'
  )!;
  act(() => {
    video.volume = 0;
    video.dispatchEvent(new Event('volumechange'));
  });
  expect(Number(volume.value)).toBe(0);
  expect(volume.getAttribute('aria-valuetext')).toBe('0%');
  expect(button('mute').querySelector('.lucide-volume')).not.toBeNull();

  act(() => {
    video.muted = true;
    video.dispatchEvent(new Event('volumechange'));
  });
  expect(button('unmute').querySelector('.lucide-volume-x')).not.toBeNull();
  expect(Number(volume.value)).toBe(0);

  act(() => {
    video.volume = 1;
    video.dispatchEvent(new Event('volumechange'));
  });
  expect(Number(volume.value)).toBe(0);
  expect(button('unmute')).not.toBeNull();
  expect(volume.getAttribute('aria-valuetext')).toBe('0%');
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
  video.currentTime = 8;
  const select = button('scale');
  act(() => {
    select.click();
  });
  const original = [
    ...document.querySelectorAll<HTMLButtonElement>('[role="listbox"] [role="option"]'),
  ].find((option) => option.textContent?.includes('gallery.preview.player.original'));
  act(() => original?.click());
  expect(video.className).toContain('max-w-none');
  expect(host.querySelector('video')).toBe(video);
  expect(video.currentTime).toBe(8);
  expect(
    video.closest('[data-ui="gallery.preview.player"]')?.querySelector('[tabindex="0"]')?.className
  ).toContain('overflow-auto');
  expect(button('scale')).not.toBeNull();
  expect(button('fullscreen')).not.toBeNull();
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

it('reports muted zero without discarding the volume restored by unmute', () => {
  const video = mount();
  const range = host.querySelector<HTMLInputElement>(
    'input[aria-label="gallery.preview.player.volume"]'
  )!;
  act(() => {
    video.volume = 0.37;
    video.dispatchEvent(new Event('volumechange'));
  });
  act(() => {
    button('mute').click();
    video.dispatchEvent(new Event('volumechange'));
  });
  expect(video.muted).toBe(true);
  expect(video.volume).toBe(0.37);
  expect(range.valueAsNumber).toBe(0);
  expect(range.getAttribute('aria-valuetext')).toBe('0%');
  act(() => {
    button('unmute').click();
    video.dispatchEvent(new Event('volumechange'));
  });
  expect(video.muted).toBe(false);
  expect(video.volume).toBe(0.37);
  expect(range.valueAsNumber).toBe(0.37);
  expect(range.getAttribute('aria-valuetext')).toBe('37%');
});

function fullscreenPlayer() {
  const player = host.querySelector<HTMLElement>('[data-ui="gallery.preview.player"]')!;
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: player });
  act(() => document.dispatchEvent(new Event('fullscreenchange')));
  return player;
}
function controlsVisible() {
  return host
    .querySelector('[data-ui="gallery.preview.player.controls"]')
    ?.getAttribute('data-visible');
}
function advance(ms = 2100) {
  act(() => vi.advanceTimersByTime(ms));
}
function pointer(target: EventTarget, type: string) {
  act(() => target.dispatchEvent(new MouseEvent(type, { bubbles: true })));
}

it('hides only idle playing fullscreen controls and reveals them on activity or pause', () => {
  vi.useFakeTimers();
  const video = mount();
  act(() => video.dispatchEvent(new Event('play')));
  advance();
  expect(controlsVisible()).toBe('true');
  fullscreenPlayer();
  advance(1000);
  act(() => video.dispatchEvent(new Event('timeupdate')));
  advance(1000);
  expect(controlsVisible()).toBe('false');
  pointer(video, 'pointermove');
  expect(controlsVisible()).toBe('true');
  advance();
  expect(controlsVisible()).toBe('false');
  act(() => video.dispatchEvent(new Event('pause')));
  advance();
  expect(controlsVisible()).toBe('true');
});

it('pins active hover and keyboard focus and starts a fresh interval when they leave', async () => {
  vi.useFakeTimers();
  const video = mount();
  const player = fullscreenPlayer();
  act(() => video.dispatchEvent(new Event('play')));
  const control = button('mute');
  pointer(control, 'pointermove');
  advance();
  expect(controlsVisible()).toBe('true');
  pointer(player, 'pointerleave');
  advance();
  expect(controlsVisible()).toBe('false');
  act(() => {
    control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    control.focus();
  });
  advance();
  expect(controlsVisible()).toBe('true');
  const outside = document.createElement('button');
  document.body.append(outside);
  await act(async () => outside.focus());
  advance(1999);
  expect(controlsVisible()).toBe('true');
  advance(1);
  expect(controlsVisible()).toBe('false');
  outside.remove();
});

it('keeps a range gesture alive outside controls until release or cancellation', () => {
  vi.useFakeTimers();
  const video = mount();
  const player = fullscreenPlayer();
  act(() => video.dispatchEvent(new Event('play')));
  const seek = host.querySelector<HTMLInputElement>('[aria-label="gallery.preview.player.seek"]')!;
  for (const completion of ['pointerup', 'pointercancel']) {
    pointer(seek, 'pointerdown');
    pointer(player, 'pointerleave');
    advance();
    expect(controlsVisible()).toBe('true');
    pointer(window, completion);
    advance();
    expect(controlsVisible()).toBe('false');
  }
});

it('pins actual expanded settings and portal focus until pointer selection closes the menu', async () => {
  vi.useFakeTimers();
  const video = mount();
  const player = fullscreenPlayer();
  act(() => video.dispatchEvent(new Event('play')));
  const speed = button('speed');
  pointer(speed, 'pointerdown');
  pointer(window, 'pointerup');
  await act(async () => speed.click());
  expect(speed.getAttribute('aria-expanded')).toBe('true');
  const option = player.querySelector<HTMLButtonElement>('[role="listbox"] [role="option"]')!;
  await act(async () => option.focus());
  advance();
  expect(controlsVisible()).toBe('true');
  // jsdom always treats programmatic focus as keyboard focus; emulate this pointer restoration.
  const nativeMatches = speed.matches.bind(speed);
  vi.spyOn(speed, 'matches').mockImplementation((selector) =>
    selector === ':focus-visible' ? false : nativeMatches(selector)
  );
  await act(async () => option.click());
  expect(speed.getAttribute('aria-expanded')).toBe('false');
  pointer(video, 'pointermove');
  advance();
  expect(controlsVisible()).toBe('false');
});

it('disposes old fullscreen/source deadlines and retains intrinsic and fit video geometry', () => {
  vi.useFakeTimers();
  const video = mount();
  const player = fullscreenPlayer();
  act(() => video.dispatchEvent(new Event('play')));
  advance(1500);
  act(() => root.render(<PreviewVideo src="blob:replacement" />));
  advance(1000);
  expect(controlsVisible()).toBe('true');
  advance(1000);
  expect(controlsVisible()).toBe('false');
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
  act(() => document.dispatchEvent(new Event('fullscreenchange')));
  advance();
  expect(controlsVisible()).toBe('true');
  expect(video.className).toContain('object-contain');
  expect(video.className).toContain('bg-transparent');
  expect(video.className).not.toContain('bg-black');
  expect(player.getAttribute('data-fullscreen')).toBe('false');
  act(() => root.render(null));
  advance();
  expect(host.querySelector('video')).toBeNull();
});
