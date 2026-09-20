// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useZoomPreviewSource, type ZoomPreviewFrameLoader } from './use-zoom-preview-source';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function mountSource(readyState = 2) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const video = document.createElement('video');
  Object.defineProperties(video, {
    readyState: { value: readyState, configurable: true },
    duration: { value: 12 },
    videoWidth: { value: 640 },
    videoHeight: { value: 360 },
  });
  vi.spyOn(video, 'load').mockImplementation(() => undefined);
  const create = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag, options) =>
    tag === 'video' ? video : create(tag, options)
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  const revoke = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:preview', revokeObjectURL: revoke });
  const host = document.createElement('div');
  const root = createRoot(host);
  let loader: ZoomPreviewFrameLoader | null = null;
  const file = new File(['video'], 'video.webm');
  function Probe() {
    loader = useZoomPreviewSource(file);
    return null;
  }
  act(() => root.render(<Probe />));
  dispose = () => {
    act(() => root.unmount());
    dispose = undefined;
  };
  return { load: (time: number, signal: AbortSignal) => loader!(time, signal), video, revoke };
}

it('reuses an already decoded timestamp without waiting for a seek event that never fires', async () => {
  const source = mountSource();
  const signal = new AbortController().signal;
  expect((await source.load(0, signal)).width).toBe(640);
  expect((await source.load(0, signal)).height).toBe(360);
  expect(source.video.muted).toBe(true);
});

it('aborts a metadata wait and releases the queue for the next frame', async () => {
  const source = mountSource(0);
  const controller = new AbortController();
  const pending = source.load(0, controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await Promise.resolve();
  controller.abort();
  await rejected;
  Object.defineProperty(source.video, 'readyState', { value: 2 });
  await expect(source.load(0, new AbortController().signal)).resolves.toMatchObject({ width: 640 });
});

it('settles pending work and revokes its URL when the owner unmounts', async () => {
  const source = mountSource(0);
  const pending = source.load(0, new AbortController().signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await Promise.resolve();
  dispose?.();
  await rejected;
  expect(source.revoke).toHaveBeenCalledWith('blob:preview');
  expect(source.video.hasAttribute('src')).toBe(false);
});

it('times out a source which produces neither data nor an error', async () => {
  vi.useFakeTimers();
  const source = mountSource(0);
  const rejected = expect(source.load(0, new AbortController().signal)).rejects.toThrow(
    'unavailable'
  );
  await vi.advanceTimersByTimeAsync(10_000);
  await rejected;
});
