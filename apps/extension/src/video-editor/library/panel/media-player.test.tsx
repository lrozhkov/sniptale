// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LibraryMediaPlayer } from './media-player';
vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
let container: HTMLDivElement;
let root: Root;
let video: HTMLVideoElement;
const control = (key: string) =>
  container.querySelector<HTMLButtonElement>(`[aria-label="${key}"]`)!;
function space(target: HTMLElement) {
  const event = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true });
  act(() => target.dispatchEvent(event));
  return event;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(
    function (this: HTMLMediaElement) {
      Object.defineProperty(this, 'paused', { configurable: true, value: false });
      this.dispatchEvent(new Event('play'));
      return Promise.resolve();
    }
  );
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(
    function (this: HTMLMediaElement) {
      Object.defineProperty(this, 'paused', { configurable: true, value: true });
      this.dispatchEvent(new Event('pause'));
    }
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <LibraryMediaPlayer src="blob:preview" filename="Recording">
        <span>Loading</span>
      </LibraryMediaPlayer>
    )
  );
  video = container.querySelector('video')!;
  Object.defineProperty(video, 'error', { value: null, configurable: true });
  Object.defineProperty(video, 'duration', { value: 4, configurable: true });
  Object.defineProperty(video, 'readyState', { value: 1, configurable: true });
  act(() => video.dispatchEvent(new Event('loadedmetadata')));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('owns Space from a focused action and pauses the same preview without moving focus', () => {
  const action = document.createElement('button');
  container.append(action);
  action.focus();
  const nativeKey = vi.fn();
  action.addEventListener('keydown', nativeKey);
  expect(space(action).defaultPrevented).toBe(true);
  expect(video.paused).toBe(false);
  expect(control('videoEditor.timeline.pause')).not.toBeNull();
  expect(space(action).defaultPrevented).toBe(true);
  expect(video.paused).toBe(true);
  expect(document.activeElement).toBe(action);
  expect(nativeKey).not.toHaveBeenCalled();
});
it('seeks and mutes through product controls while enlarging only the picture', () => {
  const seek = control('videoEditor.sidebar.mediaPreviewSeek');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(seek, '2');
    seek.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(video.currentTime).toBe(2);
  act(() => control('videoEditor.sidebar.mediaPreviewMute').click());
  expect(video.muted).toBe(true);
  const zoom = control('videoEditor.sidebar.mediaPreviewZoomLabel');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(zoom, '2');
    zoom.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(
    container.querySelector<HTMLElement>('[data-ui="library-media-picture"]')!.style.width
  ).toBe('200%');
  expect(video.style.transform).toBe('');
  expect(
    container.querySelector('[data-ui="library-media-picture"] [data-ui="library-media-transport"]')
  ).toBeNull();
});
it('keeps a failed Play retryable', async () => {
  vi.mocked(video.play).mockRejectedValueOnce(new Error('denied'));
  await act(async () => control('videoEditor.timeline.play').click());
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  await act(async () => control('videoEditor.timeline.play').click());
  expect(video.paused).toBe(false);
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
it('pauses the media when its selected recording leaves the surface', () => {
  space(container);
  vi.mocked(video.pause).mockClear();
  act(() => root.render(<div>Another recording</div>));
  expect(video.pause).toHaveBeenCalledOnce();
  expect(space(container).defaultPrevented).toBe(false);
});

it.each([Infinity, NaN])(
  'probes decodable media with unknown duration %s before enabling playback',
  async (duration) => {
    Object.defineProperty(video, 'duration', { value: duration, configurable: true });
    act(() => video.dispatchEvent(new Event('loadedmetadata')));
    expect(control('videoEditor.timeline.play').disabled).toBe(true);
    expect(control('videoEditor.sidebar.mediaPreviewSeek').disabled).toBe(true);
    expect(container.querySelector('[data-ui="library-media-transport"]')?.textContent).toContain(
      '—'
    );
    await act(async () => control('videoEditor.timeline.play').click());
    expect(video.play).not.toHaveBeenCalled();
    Object.defineProperty(video, 'duration', { value: 3.25, configurable: true });
    act(() => video.dispatchEvent(new Event('durationchange')));
    expect(control('videoEditor.sidebar.mediaPreviewSeek').disabled).toBe(false);
    expect(control('videoEditor.sidebar.mediaPreviewSeek').getAttribute('max')).toBe('3.25');
  }
);

it('does not admit playback before metadata or after decode failure', () => {
  Object.defineProperty(video, 'readyState', { value: 0, configurable: true });
  act(() => video.dispatchEvent(new Event('loadedmetadata')));
  expect(control('videoEditor.timeline.play').disabled).toBe(true);
  Object.defineProperty(video, 'readyState', { value: 1, configurable: true });
  Object.defineProperty(video, 'error', { value: { code: 3 }, configurable: true });
  act(() => video.dispatchEvent(new Event('error')));
  expect(control('videoEditor.timeline.play').disabled).toBe(true);
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
});

it('pans the enlarged preview and releases its pointer when cancelled', () => {
  const viewport = container.querySelector<HTMLDivElement>('[data-ui="library-media-viewport"]')!;
  const capture = vi.fn();
  const release = vi.fn();
  viewport.setPointerCapture = capture;
  viewport.hasPointerCapture = () => true;
  viewport.releasePointerCapture = release;
  const pointer = (type: string, x: number, y: number) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: x,
      clientY: y,
    });
    Object.defineProperty(event, 'pointerId', { value: 7 });
    act(() => viewport.dispatchEvent(event));
  };
  pointer('pointerdown', 100, 100);
  expect(capture).not.toHaveBeenCalled();
  const zoom = control('videoEditor.sidebar.mediaPreviewZoomLabel');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(zoom, '2');
    zoom.dispatchEvent(new Event('change', { bubbles: true }));
  });
  viewport.scrollLeft = 40;
  viewport.scrollTop = 60;
  pointer('pointerdown', 100, 100);
  expect(capture).toHaveBeenCalledWith(7);
  expect(viewport.style.cursor).toBe('grabbing');
  pointer('pointermove', 70, 80);
  expect(viewport.scrollLeft).toBe(70);
  expect(viewport.scrollTop).toBe(80);
  pointer('pointercancel', 70, 80);
  expect(release).toHaveBeenCalledWith(7);
  expect(viewport.style.cursor).toBe('grab');
  pointer('pointermove', 30, 30);
  expect(viewport.scrollLeft).toBe(70);
});

it('places fullscreen Close after playback and exits through the browser owner', () => {
  const frame = container.querySelector('[data-ui="library-media-player"]');
  const exit = vi.fn(async () => undefined);
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => frame });
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });
  act(() => document.dispatchEvent(new Event('fullscreenchange')));
  const transport = container.querySelector('[data-ui="library-media-transport"]')!;
  const close = transport.querySelectorAll<HTMLButtonElement>('button');
  const exitButton = close[close.length - 1]!;
  expect(exitButton.dataset['ui']).toBe('library-media-fullscreen-close');
  act(() => exitButton.click());
  expect(exit).toHaveBeenCalledOnce();
  Reflect.deleteProperty(document, 'fullscreenElement');
  Reflect.deleteProperty(document, 'exitFullscreen');
});

it('restores keyboard focus to the fullscreen trigger after leaving fullscreen', () => {
  const frame = container.querySelector('[data-ui="library-media-player"]');
  control('videoEditor.stage.enterFullscreen').focus();
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: frame });
  act(() => document.dispatchEvent(new Event('fullscreenchange')));
  control('videoEditor.stage.exitFullscreen').focus();
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
  act(() => document.dispatchEvent(new Event('fullscreenchange')));
  expect(document.activeElement).toBe(control('videoEditor.stage.enterFullscreen'));
  Reflect.deleteProperty(document, 'fullscreenElement');
});

it('probes missing recording duration before Play and returns to the first frame', () => {
  Object.defineProperty(video, 'duration', { configurable: true, value: Infinity });
  act(() => video.dispatchEvent(new Event('loadedmetadata')));
  expect(video.currentTime).toBe(Number.MAX_SAFE_INTEGER);
  expect(control('videoEditor.timeline.play').disabled).toBe(true);
  expect(video.play).not.toHaveBeenCalled();
  Object.defineProperty(video, 'duration', { configurable: true, value: 42 });
  act(() => video.dispatchEvent(new Event('durationchange')));
  expect(video.currentTime).toBe(0);
  expect(control('videoEditor.sidebar.mediaPreviewSeek').disabled).toBe(false);
  expect(control('videoEditor.timeline.play').disabled).toBe(false);
});
