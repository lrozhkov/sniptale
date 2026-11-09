// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import * as sourceProvider from '../../../../../workflows/video/preview-source';
import * as htmlProvider from '../../../../../workflows/video/preview-html-source';
import * as decoded from '../../../../../features/video/composition/draw/decoded-sample';
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
  const fallbackCanvas = document.createElement('canvas');
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
    fallbackCanvas: () => fallbackCanvas,
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
    fallbackCanvas,
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

function managedFixture(renderer: 'gpu' | 'legacy' = 'gpu') {
  const f = fixture();
  class Frame {
    format = 'RGBA';
    codedWidth = 640;
    codedHeight = 360;
    displayWidth = 640;
    displayHeight = 360;
    timestamp = 900000;
    duration = 100000;
    colorSpace = {};
    close = vi.fn();
  }
  vi.stubGlobal('VideoFrame', Frame);
  vi.stubGlobal('VideoDecoder', class {});
  const raw = new Frame();
  const lease = {
    bindings: new Map([
      [
        'bookend',
        {
          timestamp: 0.9,
          nextTimestamp: 1.4,
          target: 1.02,
          url: 'blob:video',
          source: {
            sourceWidth: 640,
            sourceHeight: 360,
            toVideoFrame: () => raw as unknown as VideoFrame,
            draw: vi.fn(),
          },
        },
      ],
    ]),
    release: vi.fn(),
  };
  const acquire = vi.fn().mockResolvedValue(lease);
  const canonical = { acquire, retainSources: vi.fn(), dispose: vi.fn() };
  vi.spyOn(sourceProvider, 'createPreviewSourceProvider').mockReturnValue(canonical);
  const compatible = {
    acquire: vi.fn().mockResolvedValue(lease),
    retainSources: vi.fn(),
    dispose: vi.fn(),
  };
  vi.spyOn(htmlProvider, 'createPreviewHtmlSourceProvider').mockReturnValue(compatible);
  const normalize = vi
    .spyOn(decoded, 'prepareDecodedVideoSample')
    .mockImplementation(async (sample) => {
      vi.spyOn(sample, 'draw').mockImplementation(() => {});
      return sample;
    });
  const rgb = f.pixels();
  const transferred = vi.fn(() => rgb.bitmap);
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(
        public width: number,
        public height: number
      ) {}
      getContext() {
        return {};
      }
      transferToImageBitmap = transferred;
    }
  );
  const draw = vi.fn();
  vi.spyOn(f.fallbackCanvas, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    drawImage: draw,
  } as unknown as CanvasRenderingContext2D);
  f.set({
    renderer,
    source: {
      ...f.read().source,
      kind: 'video',
      element: null,
      url: 'blob:video',
      time: 1.02,
      rangeEnd: 3,
      ready: true,
    },
  });
  return { ...f, acquire, compatible, canonical, lease, raw, normalize, rgb, transferred, draw };
}

it('selects canonical bookend pixels without DOM decoder readiness and retains RGB across framing', async () => {
  const f = managedFixture();
  f.queue.request();
  await settle();
  expect(f.acquire).toHaveBeenCalledWith(
    [{ id: 'bookend', url: 'blob:video', time: 1.02, rangeEnd: 3 }],
    expect.any(AbortSignal),
    { discontinuity: true }
  );
  expect(f.capture).not.toHaveBeenCalled();
  expect(f.normalize).toHaveBeenCalledOnce();
  expect(f.lease.release).toHaveBeenCalledOnce();
  expect(f.jobs[0]!.input.source).toBe(f.rgb.bitmap);
  f.jobs[0]!.completion.resolve(f.output());
  await settle();
  f.set({ framing: { ...f.read().framing, fit: 'cover' } });
  f.queue.request();
  await settle();
  expect(f.jobs[1]!.input.source).toBe(f.rgb.bitmap);
  expect(f.acquire).toHaveBeenCalledOnce();
  expect(f.rgb.close).not.toHaveBeenCalled();
  f.queue.dispose();
  expect(f.rgb.close).not.toHaveBeenCalled();
  f.jobs[1]!.completion.resolve(f.output());
  await settle();
  expect(f.rgb.close).toHaveBeenCalledOnce();
});
it.each(['legacy', 'device-failed'] as const)(
  'paints the same normalized RGB through %s fallback',
  async (mode) => {
    const f = managedFixture(mode === 'legacy' ? 'legacy' : 'gpu');
    f.queue.request();
    await settle();
    if (mode === 'device-failed') {
      f.fallback('device-failed');
      f.jobs[0]!.completion.resolve(undefined);
      await settle();
    }
    expect(f.acquire).toHaveBeenCalledOnce();
    expect(f.presenter.publish).toHaveBeenLastCalledWith(null, expect.any(Function));
    expect(f.draw).toHaveBeenCalledWith(f.rgb.bitmap, 0, 0, 320, 180);
    expect(f.rgb.close).not.toHaveBeenCalled();
    expect(f.capture).not.toHaveBeenCalled();
  }
);
it('uses verified HTML only after upfront canonical decline', async () => {
  const f = managedFixture();
  f.acquire.mockResolvedValueOnce(null);
  f.queue.request();
  await settle();
  expect(f.compatible.acquire).toHaveBeenCalledWith(
    [{ id: 'bookend', url: 'blob:video', time: 1.02, rangeEnd: 3 }],
    expect.any(AbortSignal)
  );
  expect(f.jobs[0]!.input.source).toBe(f.rgb.bitmap);
  expect(f.capture).not.toHaveBeenCalled();
  f.jobs[0]!.completion.resolve(f.output());
  await settle();
});

it.each(['cancel', 'dispose'] as const)(
  'releases a late canonical lease after %s without publishing',
  async (action) => {
    const f = managedFixture();
    const gate = deferred<typeof f.lease>();
    f.acquire.mockReturnValueOnce(gate.promise);
    f.queue.request();
    await settle();
    expect(f.presenter.publish).not.toHaveBeenCalled();
    f.queue[action]();
    gate.resolve(f.lease);
    await settle();
    expect(f.lease.release).toHaveBeenCalledOnce();
    expect(f.normalize).not.toHaveBeenCalled();
    expect(f.onError).not.toHaveBeenCalled();
    expect(f.presenter.publish).not.toHaveBeenCalled();
  }
);
it('holds the borrowed sample through delayed normalization cancellation', async () => {
  const f = managedFixture();
  const gate = deferred<void>();
  f.normalize.mockImplementationOnce(async (sample) => {
    await gate.promise;
    return sample;
  });
  f.queue.request();
  await settle();
  f.queue.cancel();
  expect(f.raw.close).not.toHaveBeenCalled();
  expect(f.lease.release).not.toHaveBeenCalled();
  gate.resolve();
  await settle();
  expect(f.raw.close).toHaveBeenCalledOnce();
  expect(f.lease.release).toHaveBeenCalledOnce();
  expect(f.presenter.publish).not.toHaveBeenCalled();
  expect(f.onError).not.toHaveBeenCalled();
});
it('reports a genuine canonical failure without raw or compatible capture and permits retry', async () => {
  const f = managedFixture();
  f.acquire.mockRejectedValueOnce(new Error('decode failed'));
  f.queue.request();
  await settle();
  expect(f.onError).toHaveBeenCalledOnce();
  expect(f.compatible.acquire).not.toHaveBeenCalled();
  expect(f.capture).not.toHaveBeenCalled();
  expect(f.presenter.publish).not.toHaveBeenCalled();
  f.queue.reset();
  f.queue.request();
  await settle();
  expect(f.jobs[0]!.input.source).toBe(f.rgb.bitmap);
  f.jobs[0]!.completion.resolve(f.output());
  await settle();
  expect(f.presenter.publish).toHaveBeenCalledOnce();
});
it('reuses the admitted video RGB when Standard replaces GPU', async () => {
  const f = managedFixture();
  f.queue.request();
  await settle();
  f.jobs[0]!.completion.resolve(f.output());
  await settle();
  f.set({ renderer: 'legacy' });
  f.queue.request();
  await settle();
  expect(f.acquire).toHaveBeenCalledOnce();
  expect(f.normalize).toHaveBeenCalledOnce();
  expect(f.draw).toHaveBeenCalledWith(f.rgb.bitmap, 0, 0, 320, 180);
  expect(f.rgb.close).not.toHaveBeenCalled();
});
