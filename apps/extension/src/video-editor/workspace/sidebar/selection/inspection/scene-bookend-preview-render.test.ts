// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  createBookendPreviewFrameQueue,
  type BookendPreviewFrameInput,
} from './scene-bookend-preview-render';
import type { createBookendPreviewGpuRenderer } from '../../../../../features/video/composition/canvas/bookend-preview-gpu';
import type {
  GpuPreviewFramePresenter,
  GpuPreviewOutput,
} from '../../../../../features/video/composition/canvas/preview-presentation';
import type { PreviewRendererStatus } from '../../../../../features/video/preview/preferences';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function settle() {
  for (let index = 0; index < 12; index++) await Promise.resolve();
}
const queues: ReturnType<typeof createBookendPreviewFrameQueue>[] = [];
afterEach(() => {
  for (const queue of queues.splice(0)) queue.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function image(url = 'blob:image') {
  const element = document.createElement('img');
  element.src = url;
  Object.defineProperties(element, {
    complete: { value: true },
    naturalWidth: { value: 640 },
    naturalHeight: { value: 360 },
  });
  return element;
}
function fixture() {
  const captures: ReturnType<typeof deferred<ImageBitmap>>[] = [];
  const capture = vi.fn(() => {
    const next = deferred<ImageBitmap>();
    captures.push(next);
    return next.promise;
  });
  vi.stubGlobal('createImageBitmap', capture);
  const stage = document.createElement('div');
  const bounds = vi
    .spyOn(stage, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(0, 0, 320, 180));
  let input: BookendPreviewFrameInput = {
    source: {
      kind: 'image',
      element: image(),
      key: 'first',
      url: 'blob:image',
      time: 0,
      size: { width: 640, height: 360 },
      ready: true,
    },
    framing: { fit: 'contain', fillColor: '#000000ff', crop: { panX: 0, panY: 0 } },
    logical: { width: 1920, height: 1080 },
    renderer: 'gpu',
  };
  type Producer = ReturnType<typeof createBookendPreviewGpuRenderer>;
  type Result = Awaited<ReturnType<Producer['render']>>;
  const jobs: {
    input: Parameters<Producer['render']>[0];
    completion: ReturnType<typeof deferred<Result>>;
  }[] = [];
  let fallbackReason: PreviewRendererStatus['fallback'];
  const renderer: Producer = {
    get fallbackReason() {
      return fallbackReason;
    },
    dispose: vi.fn(),
    render: vi.fn((value) => {
      const completion = deferred<Result>();
      jobs.push({ input: value, completion });
      return completion.promise;
    }),
  };
  const createRenderer = vi.fn(() => renderer);
  const presenter: GpuPreviewFramePresenter = {
    acquire: vi.fn(),
    publish: vi.fn((_output, accept) => accept()),
  };
  const onPresented = vi.fn(),
    onError = vi.fn();
  const queue = createBookendPreviewFrameQueue({
    stage,
    presenter,
    read: () => input,
    onPresented,
    onError,
    createRenderer,
  });
  queues.push(queue);
  const set = (change: Partial<BookendPreviewFrameInput>) => {
    input = { ...input, ...change };
  };
  const pixels = () => {
    const close = vi.fn();
    return { bitmap: { width: 640, height: 360, close } as ImageBitmap, close };
  };
  const captured = async (index = 0) => {
    const result = pixels();
    captures[index]!.resolve(result.bitmap);
    await settle();
    return result;
  };
  const output = (): GpuPreviewOutput => ({
    canvas: document.createElement('canvas'),
    release: vi.fn(),
  });
  return {
    queue,
    set,
    read: () => input,
    capture,
    captures,
    captured,
    pixels,
    jobs,
    output,
    presenter,
    onPresented,
    onError,
    createRenderer,
    renderer,
    bounds,
    fallback: (reason: PreviewRendererStatus['fallback']) => {
      fallbackReason = reason;
    },
  };
}

it('retains one captured image across framing and output changes', async () => {
  const f = fixture();
  f.queue.request();
  await settle();
  const source = await f.captured();
  const first = f.output();
  f.jobs[0]!.completion.resolve(first);
  await settle();
  f.set({
    framing: { ...f.read().framing, fit: 'cover', crop: { panX: 0.5, panY: -0.2 } },
    logical: { width: 1280, height: 720 },
  });
  f.bounds.mockReturnValue(new DOMRect(0, 0, 400, 225));
  f.queue.request();
  await settle();
  expect(f.capture).toHaveBeenCalledOnce();
  expect(f.jobs[1]!.input).toMatchObject({
    source: source.bitmap,
    output: { width: 400, height: 225 },
    logical: { width: 1280, height: 720 },
    framing: f.read().framing,
  });
  expect(source.close).not.toHaveBeenCalled();
  const second = f.output();
  f.jobs[1]!.completion.resolve(second);
  await settle();
  expect(f.presenter.publish).toHaveBeenLastCalledWith(second, expect.any(Function));
  expect(f.onPresented).toHaveBeenLastCalledWith(f.read(), { backend: 'gpu' });
  f.queue.dispose();
  expect(source.close).toHaveBeenCalledOnce();
});

it('runs one GPU job and retains only the latest pending framing request', async () => {
  const f = fixture();
  f.queue.request();
  await settle();
  const source = await f.captured();
  f.set({ logical: { width: 800, height: 600 } });
  f.queue.request();
  f.set({ logical: { width: 1000, height: 500 } });
  f.queue.request();
  await settle();
  expect(f.jobs).toHaveLength(1);
  expect(f.jobs[0]!.input.signal.aborted).toBe(true);
  expect(source.close).not.toHaveBeenCalled();
  const stale = f.output();
  f.jobs[0]!.completion.resolve(stale);
  await settle();
  expect(stale.release).toHaveBeenCalledOnce();
  expect(f.presenter.publish).not.toHaveBeenCalled();
  expect(f.jobs).toHaveLength(2);
  expect(f.jobs[1]!.input.logical).toEqual({ width: 1000, height: 500 });
  expect(f.capture).toHaveBeenCalledOnce();
  f.jobs[1]!.completion.resolve(f.output());
  await settle();
  expect(f.presenter.publish).toHaveBeenCalledOnce();
});

it.each(['replacement', 'cancel', 'dispose'] as const)(
  'retains a borrowed source through GPU completion after %s and releases stale output',
  async (action) => {
    const f = fixture();
    f.queue.request();
    await settle();
    const source = await f.captured();
    if (action === 'replacement') {
      f.set({
        source: { ...f.read().source, element: image('blob:next'), key: 'next', url: 'blob:next' },
      });
      f.queue.request();
    } else f.queue[action]();
    expect(source.close).not.toHaveBeenCalled();
    const stale = f.output();
    f.jobs[0]!.completion.resolve(stale);
    await settle();
    expect(source.close).toHaveBeenCalledOnce();
    expect(stale.release).toHaveBeenCalledOnce();
    expect(f.presenter.publish).not.toHaveBeenCalled();
    if (action === 'replacement') {
      expect(f.capture).toHaveBeenCalledTimes(2);
      await f.captured(1);
      f.jobs[1]!.completion.resolve(f.output());
      await settle();
      expect(f.presenter.publish).toHaveBeenCalledOnce();
    }
  }
);

it('closes a delayed image capture after cancellation without rendering or publishing', async () => {
  const f = fixture();
  f.queue.request();
  await settle();
  f.queue.cancel();
  const source = await f.captured();
  expect(source.close).toHaveBeenCalledOnce();
  expect(f.renderer.render).not.toHaveBeenCalled();
  expect(f.presenter.publish).not.toHaveBeenCalled();
});

it('captures video without VideoFrame and recaptures only after the source time changes', async () => {
  const f = fixture();
  vi.stubGlobal('VideoFrame', undefined);
  const video = document.createElement('video');
  video.src = 'blob:video';
  video.currentTime = 1;
  Object.defineProperty(video, 'readyState', { value: 2 });
  f.set({
    source: { ...f.read().source, kind: 'video', element: video, url: 'blob:video', time: 1 },
  });
  f.queue.request();
  await settle();
  expect(f.capture).toHaveBeenCalledWith(video);
  const first = await f.captured();
  expect(f.jobs[0]!.input.source).toBe(first.bitmap);
  video.currentTime = 2;
  f.set({ source: { ...f.read().source, time: 2 } });
  f.queue.request();
  expect(first.close).not.toHaveBeenCalled();
  expect(f.capture).toHaveBeenCalledOnce();
  const stale = f.output();
  f.jobs[0]!.completion.resolve(stale);
  await settle();
  expect(first.close).toHaveBeenCalledOnce();
  expect(stale.release).toHaveBeenCalledOnce();
  expect(f.capture).toHaveBeenCalledTimes(2);
  expect(f.capture).toHaveBeenLastCalledWith(video);
  const second = await f.captured(1);
  expect(f.jobs[1]!.input.source).toBe(second.bitmap);
  expect(f.presenter.publish).not.toHaveBeenCalled();
  f.jobs[1]!.completion.resolve(f.output());
  await settle();
  expect(f.onPresented).toHaveBeenLastCalledWith(f.read(), { backend: 'gpu' });
  f.set({ framing: { ...f.read().framing, crop: { panX: 0.3, panY: -0.2 } } });
  f.queue.request();
  await settle();
  expect(f.capture).toHaveBeenCalledTimes(2);
  expect(f.jobs[2]!.input.source).toBe(second.bitmap);
  expect(second.close).not.toHaveBeenCalled();
  f.jobs[2]!.completion.resolve(f.output());
  await settle();
});

it.each(['image', 'video'] as const)(
  'selects DOM fallback when the %s capture API is unavailable',
  async (kind) => {
    const f = fixture();
    if (kind === 'video') {
      const video = document.createElement('video');
      video.src = 'blob:video';
      Object.defineProperty(video, 'readyState', { value: 2 });
      f.set({ source: { ...f.read().source, kind, element: video, url: 'blob:video' } });
    }
    vi.stubGlobal('createImageBitmap', undefined);
    f.queue.request();
    await settle();
    expect(f.renderer.render).not.toHaveBeenCalled();
    expect(f.presenter.publish).toHaveBeenCalledWith(null, expect.any(Function));
    expect(f.onPresented).toHaveBeenCalledWith(f.read(), {
      backend: 'legacy',
      fallback: 'unavailable',
    });
  }
);

it('uses device fallback until explicit retry replaces the renderer and captures again', async () => {
  const f = fixture();
  f.queue.request();
  await settle();
  const source = await f.captured();
  f.fallback('device-failed');
  f.jobs[0]!.completion.resolve(undefined);
  await settle();
  expect(source.close).toHaveBeenCalledOnce();
  expect(f.onPresented).toHaveBeenLastCalledWith(f.read(), {
    backend: 'legacy',
    fallback: 'device-failed',
  });
  f.queue.request();
  await settle();
  expect(f.capture).toHaveBeenCalledOnce();
  expect(f.jobs).toHaveLength(1);
  f.queue.reset();
  f.fallback(undefined);
  f.queue.request();
  await settle();
  expect(f.renderer.dispose).toHaveBeenCalledOnce();
  await f.captured(1);
  expect(f.createRenderer).toHaveBeenCalledTimes(2);
  f.jobs[1]!.completion.resolve(f.output());
  await settle();
  expect(f.onPresented).toHaveBeenLastCalledWith(f.read(), { backend: 'gpu' });
});

it('reports a current capture or GPU error without publishing a fallback', async () => {
  const f = fixture();
  f.queue.request();
  await settle();
  f.captures[0]!.reject(new Error('decode failed'));
  await settle();
  expect(f.onError).toHaveBeenCalledOnce();
  expect(f.presenter.publish).not.toHaveBeenCalled();
  f.queue.reset();
  f.queue.request();
  await settle();
  await f.captured(1);
  f.jobs[0]!.completion.reject(new Error('submission failed'));
  await settle();
  expect(f.onError).toHaveBeenCalledTimes(2);
  expect(f.presenter.publish).not.toHaveBeenCalled();
});

it('does not report an obsolete GPU error after cancellation', async () => {
  const f = fixture();
  f.queue.request();
  await settle();
  const source = await f.captured();
  f.queue.cancel();
  f.jobs[0]!.completion.reject(new Error('obsolete'));
  await settle();
  expect(source.close).toHaveBeenCalledOnce();
  expect(f.onError).not.toHaveBeenCalled();
  expect(f.presenter.publish).not.toHaveBeenCalled();
});

it('retires the captured source and GPU renderer when the selected renderer becomes legacy', async () => {
  const f = fixture();
  f.queue.request();
  await settle();
  const source = await f.captured();
  f.jobs[0]!.completion.resolve(f.output());
  await settle();
  f.set({ renderer: 'legacy' });
  f.queue.request();
  await settle();
  expect(f.capture).toHaveBeenCalledOnce();
  expect(f.jobs).toHaveLength(1);
  expect(source.close).toHaveBeenCalledOnce();
  expect(f.renderer.dispose).toHaveBeenCalledOnce();
  expect(f.presenter.publish).toHaveBeenLastCalledWith(null, expect.any(Function));
  expect(f.onPresented).toHaveBeenLastCalledWith(f.read(), { backend: 'legacy' });
});

it('skips a false GPU result without publishing or choosing fallback', async () => {
  const f = fixture();
  f.queue.request();
  await settle();
  const source = await f.captured();
  f.jobs[0]!.completion.resolve(false);
  await settle();
  expect(f.presenter.publish).not.toHaveBeenCalled();
  expect(f.onPresented).not.toHaveBeenCalled();
  expect(f.onError).not.toHaveBeenCalled();
  expect(source.close).not.toHaveBeenCalled();
  f.queue.dispose();
  expect(source.close).toHaveBeenCalledOnce();
});

it.each(['capture', 'gpu'] as const)(
  'ignores a superseded %s error before the replacement passive effect requests a frame',
  async (stage) => {
    const f = fixture();
    f.queue.request();
    await settle();
    if (stage === 'gpu') await f.captured();
    f.set({ renderer: 'legacy' });
    if (stage === 'capture') f.captures[0]!.reject(new Error('obsolete capture'));
    else f.jobs[0]!.completion.reject(new Error('obsolete GPU request'));
    await settle();
    expect(f.onError).not.toHaveBeenCalled();
    expect(f.presenter.publish).not.toHaveBeenCalled();
    f.queue.request();
    await settle();
    expect(f.onPresented).toHaveBeenLastCalledWith(f.read(), { backend: 'legacy' });
    expect(f.onError).not.toHaveBeenCalled();
  }
);
