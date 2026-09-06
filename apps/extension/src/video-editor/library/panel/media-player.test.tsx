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
  Object.defineProperty(video, 'duration', { value: 4 });
  Object.defineProperty(video, 'readyState', { value: 1 });
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
