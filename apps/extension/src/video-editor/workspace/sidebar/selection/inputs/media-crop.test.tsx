// @vitest-environment jsdom
import type { VideoEditorPlaybackTimeSource } from '../../../../contracts/controller-store';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createVideoProjectFromRecording } from '../../../../../features/video/project/factories/creation';
import { translate } from '../../../../../platform/i18n';
import { MediaCropControls } from './media-crop';
import { RuntimePreviewContext } from '../../../../runtime/controller/composition/contexts';
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('edits exact source percentages and resets through the typed port', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'crop',
    filename: 'crop.webm',
    width: 400,
    height: 200,
    duration: 10,
    mimeType: 'video/webm',
    size: 10,
  });
  const clip = project.clips.find((clip) => clip.type === 'VIDEO')!;
  clip.sourceCrop = { x: 0.25, y: 0.1, width: 0.5, height: 0.8 };
  const onEdit = vi.fn();
  act(() =>
    root.render(
      <MediaCropControls
        project={project}
        clip={clip}
        currentTime={2}
        disabled={false}
        onEdit={onEdit}
      />
    )
  );
  const width = [...container.querySelectorAll('input')].find(
    (input) => input.getAttribute('aria-label') === translate('videoEditor.sidebar.mediaCropWidth')
  )!;
  expect(width).toBeDefined();
  act(() => {
    width.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(width, '45');
    width.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => width.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(onEdit).toHaveBeenCalledWith(clip.id, {
    kind: 'source-crop',
    crop: { ...clip.sourceCrop, width: 0.45 },
  });
  onEdit.mockClear();
  const reset = [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes(translate('gallery.videoReview.sourceCropReset'))
  )!;
  act(() => reset.click());
  expect(onEdit).toHaveBeenCalledWith(clip.id, { kind: 'source-crop', crop: null });
  act(() =>
    root.render(
      <MediaCropControls project={project} clip={clip} currentTime={2} disabled onEdit={onEdit} />
    )
  );
  expect([...container.querySelectorAll('input')].every((input) => input.disabled)).toBe(true);
  const { sourceCrop, ...inactive } = clip;
  onEdit.mockClear();
  act(() =>
    root.render(
      <MediaCropControls
        project={project}
        clip={{ ...inactive, rememberedSourceCrop: sourceCrop }}
        currentTime={2}
        disabled={false}
        onEdit={onEdit}
      />
    )
  );
  const restore = [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes(translate('gallery.videoReview.sourceCropRestore'))
  )!;
  expect(restore).toBeDefined();
  expect(onEdit).not.toHaveBeenCalled();
  act(() => restore.click());
  expect(onEdit).toHaveBeenCalledExactlyOnceWith(clip.id, {
    kind: 'source-crop',
    crop: sourceCrop,
  });
});

it('does not mount or seek crop media while the real disclosure is collapsed', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'closed-crop',
    filename: 'crop.mp4',
    width: 2560,
    height: 1440,
    duration: 26,
    mimeType: 'video/mp4',
    size: 10,
  });
  const clip = project.clips.find((clip) => clip.type === 'VIDEO')!;
  const seek = vi.spyOn(HTMLMediaElement.prototype, 'currentTime', 'set');
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(2);
  const render = (currentTime: number) =>
    act(() =>
      root.render(
        <MediaCropControls
          project={project}
          clip={clip}
          currentTime={currentTime}
          disabled={false}
          onEdit={vi.fn()}
        />
      )
    );
  render(10);
  expect(container.querySelector('details')!.open).toBe(false);
  render(11);
  expect(container.querySelector('video')).toBeNull();
  expect(seek).not.toHaveBeenCalled();
  expect(container.querySelectorAll('input')).toHaveLength(4);
});

function cropFixture(playbackTimeSource?: VideoEditorPlaybackTimeSource) {
  const project = createVideoProjectFromRecording({
    recordingId: 'crop-lifecycle',
    filename: 'crop.mp4',
    width: 400,
    height: 200,
    duration: 10,
    mimeType: 'video/mp4',
    size: 10,
  });
  const clip = project.clips.find((clip) => clip.type === 'VIDEO')!;
  const onEdit = vi.fn();
  const render = (currentTime: number, url = 'blob:crop') =>
    act(() =>
      root.render(
        <RuntimePreviewContext.Provider
          value={{
            assetUrls: { [clip.assetId]: url },
            registerPreviewRuntime: vi.fn(),
            setTimelinePreviewSuspended: vi.fn(),
            setTimelinePreviewViewport: vi.fn(),
            timelinePreviews: {},
          }}
        >
          <MediaCropControls
            project={project}
            clip={clip}
            currentTime={currentTime}
            playbackTimeSource={playbackTimeSource}
            disabled={false}
            onEdit={onEdit}
          />
        </RuntimePreviewContext.Provider>
      )
    );
  return { project, clip, onEdit, render };
}
function expandCrop(open: boolean) {
  act(() => {
    const details = container.querySelector('details')!;
    details.open = open;
    details.dispatchEvent(new Event('toggle'));
  });
}
it('reopens crop media at the latest time while preserving numeric nodes and drafts', () => {
  const f = cropFixture();
  const seek = vi.spyOn(HTMLMediaElement.prototype, 'currentTime', 'set');
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(2);
  f.render(1);
  const width = [...container.querySelectorAll('input')].find(
    (input) => input.getAttribute('aria-label') === translate('videoEditor.sidebar.mediaCropWidth')
  )!;
  expandCrop(true);
  const first = container.querySelector('video')!;
  expect(first.currentTime).toBe(1);
  act(() => {
    width.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(width, '37.');
    width.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(width.value).toBe('37.');
  expandCrop(false);
  expect(container.querySelector('video')).toBeNull();
  seek.mockClear();
  f.render(3);
  expect(seek).not.toHaveBeenCalled();
  expect(container.contains(width)).toBe(true);
  expect(width.value).toBe('37.');
  expandCrop(true);
  const reopened = container.querySelector('video')!;
  expect(reopened).not.toBe(first);
  expect(reopened.currentTime).toBe(3);
  expect(container.contains(width)).toBe(true);
  expect(width.value).toBe('37.');
  expect(f.onEdit).not.toHaveBeenCalled();
});
it('replaces only crop media for a changed source URL and leaves the source URL owner untouched', () => {
  const f = cropFixture();
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(2);
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load');
  f.render(1);
  const input = container.querySelector('input');
  expandCrop(true);
  const first = container.querySelector('video')!;
  expect(first.getAttribute('src')).toBe('blob:crop');
  f.render(2, 'blob:replacement');
  const replacement = container.querySelector('video')!;
  expect(replacement).not.toBe(first);
  expect(first.isConnected).toBe(false);
  expect(replacement.getAttribute('src')).toBe('blob:replacement');
  expect(replacement.currentTime).toBe(2);
  expandCrop(false);
  f.render(4, 'blob:latest');
  expect(container.querySelector('video')).toBeNull();
  expandCrop(true);
  expect(container.querySelector('video')!.getAttribute('src')).toBe('blob:latest');
  expect(container.querySelector('video')!.currentTime).toBe(4);
  expect(container.querySelector('input')).toBe(input);
  expect(load).not.toHaveBeenCalled();
  expect(f.onEdit).not.toHaveBeenCalled();
});

it('subscribes only the expanded crop preview and reads fresh time without disturbing numeric edits', () => {
  let time = 1.5;
  const listeners = new Set<() => void>();
  const playbackTimeSource: VideoEditorPlaybackTimeSource = {
    getSnapshot: () => time,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const f = cropFixture(playbackTimeSource);
  f.clip.playbackRate = 2;
  f.clip.duration = 5;
  const seek = vi.spyOn(HTMLMediaElement.prototype, 'currentTime', 'set');
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(2);
  f.render(0);
  const inputs = [...container.querySelectorAll('input')];
  expect(listeners.size).toBe(0);
  expandCrop(true);
  expect(listeners.size).toBe(1);
  expect(seek).toHaveBeenLastCalledWith(3);
  const field = inputs[0]!;
  act(() => {
    field.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, '12.3');
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => {
    time = 2;
    for (const listener of listeners) listener();
  });
  expect(seek).toHaveBeenLastCalledWith(4);
  expect([...container.querySelectorAll('input')]).toEqual(inputs);
  expect(document.activeElement).toBe(field);
  expect(field.value).toBe('12.3');
  expect(f.onEdit).not.toHaveBeenCalled();
  expandCrop(false);
  expect(listeners.size).toBe(0);
  const calls = seek.mock.calls.length;
  act(() => {
    time = 3;
    for (const listener of listeners) listener();
  });
  expect(seek.mock.calls).toHaveLength(calls);
  expandCrop(true);
  expect(seek).toHaveBeenLastCalledWith(6);
  act(() => root.render(null));
  expect(listeners.size).toBe(0);
});
