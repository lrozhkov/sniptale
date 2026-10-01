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
  ).not.toContain('%');
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
  ).not.toContain('%');
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

it.each([0, 0.37, 1])(
  'restores volume %s after mute without visible percentages',
  (previousVolume) => {
    const video = mount();
    const range = host.querySelector<HTMLInputElement>(
      'input[aria-label="gallery.preview.player.volume"]'
    )!;
    act(() => {
      video.volume = previousVolume;
      video.dispatchEvent(new Event('volumechange'));
    });
    act(() => {
      button('mute').click();
      video.dispatchEvent(new Event('volumechange'));
    });
    expect(video.muted).toBe(true);
    expect(video.volume).toBe(previousVolume);
    expect(range.valueAsNumber).toBe(0);
    expect(range.getAttribute('aria-valuetext')).toBe('0%');
    act(() => {
      button('unmute').click();
      video.dispatchEvent(new Event('volumechange'));
    });
    expect(video.muted).toBe(false);
    expect(video.volume).toBe(previousVolume);
    expect(range.valueAsNumber).toBe(previousVolume);
    expect(range.getAttribute('aria-valuetext')).toBe(`${Math.round(previousVolume * 100)}%`);
    expect(
      host.querySelector('[data-ui="gallery.preview.player.volumeGroup"]')?.textContent
    ).not.toContain('%');
  }
);

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
  const oldVideo = mount();
  fullscreenPlayer();
  act(() => oldVideo.dispatchEvent(new Event('play')));
  advance(1500);
  act(() => root.render(<PreviewVideo src="blob:replacement" />));
  const video = host.querySelector('video')!;
  expect(video).not.toBe(oldVideo);
  expect(oldVideo.hasAttribute('src')).toBe(false);
  advance(2100);
  expect(controlsVisible()).toBe('true');
  expect(video.className).toContain('object-contain');
  expect(video.className).toContain('bg-transparent');
  expect(video.className).not.toContain('bg-black');
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
  act(() => document.dispatchEvent(new Event('fullscreenchange')));
  expect(
    host.querySelector('[data-ui="gallery.preview.player"]')?.getAttribute('data-fullscreen')
  ).toBe('false');
  act(() => root.render(null));
  advance();
  expect(host.querySelector('video')).toBeNull();
});

it('gates Gallery Space during transitions and keeps other PreviewVideo hosts with their keyboard owner', async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const press = () => {
    const event = new KeyboardEvent('keydown', {
      code: 'Space',
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    act(() => button('scale').dispatchEvent(event));
    return event;
  };
  mount();
  expect(press().defaultPrevented).toBe(true);
  expect(play).not.toHaveBeenCalled();
  act(() => root.render(<PreviewVideo src="blob:clip" spacePlayback="blocked" />));
  const control = button('scale');
  act(() => control.focus());
  expect(press().defaultPrevented).toBe(true);
  expect(play).not.toHaveBeenCalled();
  act(() => root.render(<PreviewVideo src="blob:clip" spacePlayback="enabled" />));
  await act(async () => {
    press();
  });
  expect(play).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(control);
  expect(button('play').title).toContain('(Space)');
  act(() => root.render(<PreviewVideo src="blob:clip" prepare spacePlayback="enabled" />));
  const native = vi.fn();
  button('scale').addEventListener('keydown', native);
  press();
  expect(native).toHaveBeenCalledOnce();
  expect(play).toHaveBeenCalledOnce();
  act(() => root.render(null));
  const after = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true });
  act(() => window.dispatchEvent(after));
  expect(after.defaultPrevented).toBe(false);
});

it('toggles the same Gallery video once per press, consumes holds and keeps rejected Play retryable', async () => {
  const video = mount();
  const play = vi
    .spyOn(HTMLMediaElement.prototype, 'play')
    .mockRejectedValueOnce(new Error('denied'))
    .mockImplementation(function (this: HTMLMediaElement) {
      Object.defineProperty(this, 'paused', { configurable: true, value: false });
      this.dispatchEvent(new Event('play'));
      return Promise.resolve();
    });
  const pause = vi
    .mocked(HTMLMediaElement.prototype.pause)
    .mockImplementation(function (this: HTMLMediaElement) {
      Object.defineProperty(this, 'paused', { configurable: true, value: true });
      this.dispatchEvent(new Event('pause'));
    });
  act(() => root.render(<PreviewVideo src="blob:clip" spacePlayback="enabled" />));
  const action = document.createElement('input');
  action.type = 'checkbox';
  host.append(action);
  action.focus();
  const press = (repeat = false) => {
    const event = new KeyboardEvent('keydown', {
      code: 'Space',
      key: ' ',
      repeat,
      bubbles: true,
      cancelable: true,
    });
    act(() => action.dispatchEvent(event));
    return event;
  };
  await act(async () => {
    press();
  });
  expect(play).toHaveBeenCalledOnce();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('actionFailed');
  await act(async () => {
    press();
  });
  expect(play).toHaveBeenCalledTimes(2);
  expect(video.paused).toBe(false);
  press(true);
  expect(play).toHaveBeenCalledTimes(2);
  expect(pause).not.toHaveBeenCalled();
  press();
  expect(pause).toHaveBeenCalledOnce();
  expect(video.paused).toBe(true);
  expect(action.checked).toBe(false);
  expect(document.activeElement).toBe(action);
});

it('tracks actual playback position between sparse timeupdate events', () => {
  vi.useFakeTimers();
  const video = mount();
  Object.defineProperty(video, 'paused', { configurable: true, writable: true, value: false });
  act(() => video.dispatchEvent(new Event('play')));
  video.currentTime = 0.12;
  act(() => vi.advanceTimersByTime(32));
  const range = host.querySelector<HTMLInputElement>('[aria-label="gallery.preview.player.seek"]')!;
  expect(range.valueAsNumber).toBeCloseTo(0.12, 3);
});

it('places a stable duration after seek and switches only playing state to remaining time', () => {
  const video = mount();
  const clock = host.querySelector<HTMLElement>('[data-ui="gallery.preview.player.time"]')!;
  const seekRow = host.querySelector<HTMLElement>('[data-ui="gallery.preview.player.seek-row"]')!;
  expect(seekRow.lastElementChild).toBe(clock);
  expect(clock.textContent).toBe('0:30');
  act(() => {
    video.currentTime = 12;
    video.dispatchEvent(new Event('timeupdate'));
    video.dispatchEvent(new Event('play'));
  });
  expect(clock.textContent).toBe('−0:18');
  expect(clock.getAttribute('aria-label')).toBe('gallery.preview.player.remaining');
  act(() => video.dispatchEvent(new Event('pause')));
  expect(clock.textContent).toBe('0:30');
  act(() => root.render(<PreviewVideo src="blob:unknown" />));
  expect(host.querySelector('[data-ui="gallery.preview.player.time"]')?.textContent).toBe('—');
});

it('plays through the central keyboard control or fitted free area without bubbling twice', async () => {
  const video = mount();
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  const central = host.querySelector<HTMLButtonElement>(
    '[data-ui="gallery.preview.player.centralPlay"]'
  )!;
  expect(central.getAttribute('aria-label')).toBe('gallery.preview.player.playVideo');
  central.focus();
  expect(document.activeElement).toBe(central);
  await act(async () => central.click());
  expect(play).toHaveBeenCalledTimes(1);
  await act(async () => video.click());
  expect(play).toHaveBeenCalledTimes(2);
  act(() => video.dispatchEvent(new Event('play')));
  expect(host.querySelector('[data-ui="gallery.preview.player.centralPlay"]')).toBeNull();
  act(() => video.dispatchEvent(new Event('pause')));
  expect(host.querySelector('[data-ui="gallery.preview.player.centralPlay"]')).not.toBeNull();
});

it('keeps the central play hidden after intrinsic navigation until a new source opens', async () => {
  const video = mount();
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  act(() => button('scale').click());
  const original = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
    (option) => option.textContent?.includes('gallery.preview.player.original')
  )!;
  act(() => original.click());
  const viewport = host.querySelector<HTMLElement>('[data-ui="gallery.preview.player.viewport"]')!;
  act(() => {
    viewport.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 100, clientY: 100 })
    );
    viewport.dispatchEvent(
      new MouseEvent('pointermove', { bubbles: true, clientX: 60, clientY: 70 })
    );
    viewport.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  });
  expect(viewport.scrollLeft).toBe(40);
  expect(viewport.scrollTop).toBe(30);
  await act(async () => video.click());
  expect(play).not.toHaveBeenCalled();
  act(() => button('scale').click());
  const fit = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find((option) =>
    option.textContent?.includes('gallery.preview.player.fit')
  )!;
  act(() => fit.click());
  expect(host.querySelector('[data-ui="gallery.preview.player.centralPlay"]')).toBeNull();
  act(() => root.render(<PreviewVideo src="blob:new-opening" />));
  const next = host.querySelector('video')!;
  Object.defineProperty(next, 'duration', { configurable: true, value: 10 });
  act(() => next.dispatchEvent(new Event('loadedmetadata')));
  expect(host.querySelector('[data-ui="gallery.preview.player.centralPlay"]')).not.toBeNull();
});

it('does not play for fitted drag/cancel, prepared video or a blocked transition', async () => {
  const video = mount();
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  act(() => {
    video.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 10 }));
    video.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 30 }));
    video.dispatchEvent(new MouseEvent('pointercancel', { bubbles: true }));
  });
  await act(async () => video.click());
  expect(play).not.toHaveBeenCalled();
  act(() => root.render(<PreviewVideo src="blob:clip" spacePlayback="blocked" />));
  await act(async () => video.click());
  expect(play).not.toHaveBeenCalled();
  act(() => root.render(<PreviewVideo src="blob:clip" prepare />));
  expect(host.querySelector('[data-ui="gallery.preview.player.centralPlay"]')).toBeNull();
  await act(async () => video.click());
  expect(play).not.toHaveBeenCalled();
});

it('stops frame updates on buffering/pause/end and reads seek/rate directly without extrapolation', () => {
  vi.useFakeTimers();
  const cancelFrame = vi.spyOn(globalThis, 'cancelAnimationFrame');
  const video = mount();
  Object.defineProperty(video, 'paused', { configurable: true, writable: true, value: false });
  const range = host.querySelector<HTMLInputElement>('[aria-label="gallery.preview.player.seek"]')!;
  act(() => video.dispatchEvent(new Event('play')));
  video.currentTime = 3.2;
  act(() => vi.advanceTimersByTime(32));
  expect(range.valueAsNumber).toBeCloseTo(3.2);
  act(() => video.dispatchEvent(new Event('waiting')));
  video.currentTime = 5;
  act(() => vi.advanceTimersByTime(64));
  expect(range.valueAsNumber).toBeCloseTo(3.2);
  act(() => video.dispatchEvent(new Event('playing')));
  act(() => vi.advanceTimersByTime(32));
  expect(range.valueAsNumber).toBe(5);
  for (const event of ['pause', 'ended']) {
    video.currentTime += 0.25;
    const stoppedAt = video.currentTime;
    act(() => video.dispatchEvent(new Event(event)));
    expect(range.valueAsNumber).toBe(stoppedAt);
    video.currentTime += 1;
    act(() => vi.advanceTimersByTime(32));
    expect(range.valueAsNumber).toBe(stoppedAt);
  }
  video.playbackRate = 2;
  video.currentTime = 16;
  act(() => {
    video.dispatchEvent(new Event('ratechange'));
    video.dispatchEvent(new Event('play'));
  });
  act(() => vi.advanceTimersByTime(32));
  expect(range.valueAsNumber).toBe(16);
  const beforeReplacement = cancelFrame.mock.calls.length;
  act(() => root.render(<PreviewVideo src="blob:replacement" />));
  expect(cancelFrame.mock.calls.length).toBeGreaterThan(beforeReplacement);
  expect(
    host.querySelector<HTMLInputElement>('[aria-label="gallery.preview.player.seek"]')
      ?.valueAsNumber
  ).toBe(0);
  act(() => root.render(null));
  act(() => vi.advanceTimersByTime(64));
  expect(host.querySelector('video')).toBeNull();
});
