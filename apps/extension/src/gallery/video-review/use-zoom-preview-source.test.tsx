import { VideoSample } from 'mediabunny';
import * as normalization from '../../features/video/composition/draw/decoded-sample';
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  useZoomPreviewSource,
  useZoomPreviewFrame,
  type ZoomPreviewFrameLoader,
  type ZoomPreviewFrame,
} from './use-zoom-preview-source';

const canonical = vi.hoisted(() => ({
  create: vi.fn(),
  acquire: vi.fn(),
  retain: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('../../workflows/video/preview-source', () => ({
  createPreviewSourceProvider: canonical.create,
}));
const compatible = vi.hoisted(() => ({
  create: vi.fn(),
  acquire: vi.fn(),
  retain: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('../../workflows/video/preview-html-source', () => ({
  createPreviewHtmlSourceProvider: compatible.create,
}));
beforeEach(() => {
  compatible.acquire.mockReset();
  compatible.create.mockReturnValue({
    acquire: compatible.acquire,
    retainSources: compatible.retain,
    dispose: compatible.dispose,
  });
  canonical.acquire.mockReset().mockResolvedValue(null);
  canonical.retain.mockReset();
  canonical.dispose.mockReset();
  canonical.create.mockReset().mockReturnValue({
    acquire: canonical.acquire,
    retainSources: canonical.retain,
    dispose: canonical.dispose,
  });
});

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
  const normalized = { format: 'RGBA', close: vi.fn() };
  vi.stubGlobal('VideoFrame', undefined);
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
  return {
    load: (time: number, signal: AbortSignal) => loader!(time, signal),
    video,
    revoke,
    normalized,
  };
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

it('materializes owned source pixels through Frame-absent recovery', async () => {
  const source = mountSource();
  await source.load(0, new AbortController().signal);
  const context = document.createElement('canvas').getContext('2d')!;
  expect(context.drawImage).toHaveBeenCalledWith(source.video, 0, 0, 640, 360);
});

function canonicalSource() {
  const mounted = mountSource(0);
  vi.stubGlobal('VideoDecoder', class {});
  class Frame {
    format = 'RGBA';
    codedWidth = 400;
    codedHeight = 800;
    displayWidth = 400;
    displayHeight = 800;
    timestamp = 300000;
    duration = 1000;
    visibleRect = { x: 0, y: 0, width: 400, height: 800 };
    colorSpace = { matrix: 'bt709', primaries: 'bt709', transfer: 'bt709', fullRange: false };
    close = vi.fn();
  }
  vi.stubGlobal('VideoFrame', Frame);
  const frames: Frame[] = [];
  const source = {
    sourceWidth: 800,
    sourceHeight: 400,
    orientation: { rotation: 90 as const, flip: true },
    draw: vi.fn(),
    toVideoFrame: vi.fn(() => {
      const frame = new Frame();
      frames.push(frame);
      return frame as unknown as VideoFrame;
    }),
  };
  const release = vi.fn();
  const lease = {
    bindings: new Map([
      [
        'zoom-preview',
        { source, target: 0.5, timestamp: 0.3, nextTimestamp: 0.7, url: 'blob:preview' },
      ],
    ]),
    release,
  };
  canonical.acquire.mockResolvedValue(lease);
  const draw = vi.spyOn(VideoSample.prototype, 'draw').mockImplementation(function (
    this: VideoSample,
    context,
    x,
    y,
    width,
    height
  ) {
    expect(this.timestamp).toBe(0.3);
    expect(this.rotation).toBe(90);
    expect(this.flip).toBe(true);
    expect(this.colorSpace).toMatchObject(frames.at(-1)!.colorSpace);
    context.drawImage(frames.at(-1)! as unknown as CanvasImageSource, x, y, width, height);
  });
  return { ...mounted, source, release, lease, frames, draw };
}

it('copies canonical PTS and display geometry without waiting for HTML metadata', async () => {
  const source = canonicalSource();
  source.video.currentTime = 99;
  const pending = source.load(0.5, new AbortController().signal);
  void pending.catch(() => undefined);
  await Promise.resolve();
  expect(canonical.acquire).toHaveBeenCalledOnce();
  const frame = await pending;
  expect(frame).toMatchObject({
    width: 800,
    height: 400,
    selection: { target: 0.5, timestamp: 0.3, nextTimestamp: 0.7, url: 'blob:preview' },
  });
  expect(canonical.acquire).toHaveBeenCalledWith(
    [{ id: 'zoom-preview', url: 'blob:preview', time: 0.5, holdSourceEnd: true }],
    expect.any(AbortSignal),
    { discontinuity: true }
  );
  expect(source.draw).toHaveBeenCalledExactlyOnceWith(expect.anything(), 0, 0, 800, 400);
  expect(source.release).toHaveBeenCalledOnce();
  expect(source.frames[0]!.close).toHaveBeenCalledOnce();
  expect(source.source.draw).not.toHaveBeenCalled();
});

it.each(
  (['abort', 'unmount'] as const).flatMap((mode) =>
    (['canonical', 'compatible'] as const).map((route) => ({ mode, route }))
  )
)(
  'keeps $route resources until delayed normalization settles after $mode',
  async ({ mode, route }) => {
    const source = route === 'canonical' ? canonicalSource() : compatibleSource();
    const gate = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    const normalize = normalization.prepareDecodedVideoSample;
    vi.spyOn(normalization, 'prepareDecodedVideoSample').mockImplementation(
      async (sample, signal) => {
        started.resolve();
        await gate.promise;
        return normalize(sample, signal);
      }
    );
    const controller = new AbortController();
    const pending = source.load(0.5, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await started.promise;
    if (mode === 'abort') controller.abort();
    else dispose?.();
    expect(source.release).not.toHaveBeenCalled();
    expect(source.frames[0]!.close).not.toHaveBeenCalled();
    gate.resolve();
    await rejected;
    expect(source.frames[0]!.close).toHaveBeenCalledOnce();
    expect(source.release).toHaveBeenCalledOnce();
    expect(source.draw).not.toHaveBeenCalled();
  }
);

it('releases late acquisition after cancellation without capturing or copying', async () => {
  const source = canonicalSource();
  const gate = Promise.withResolvers<typeof source.lease>();
  canonical.acquire.mockReturnValueOnce(gate.promise);
  const controller = new AbortController();
  const pending = source.load(0.5, controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await Promise.resolve();
  controller.abort();
  gate.resolve(source.lease);
  await rejected;
  expect(source.release).toHaveBeenCalledOnce();
  expect(source.source.toVideoFrame).not.toHaveBeenCalled();
  expect(source.draw).not.toHaveBeenCalled();
});

it.each(['context', 'draw'] as const)(
  'cleans native resources after a %s failure',
  async (mode) => {
    const source = canonicalSource();
    if (mode === 'context')
      vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValueOnce(null);
    else
      source.draw.mockImplementationOnce(() => {
        throw new Error('draw failed');
      });
    await expect(source.load(0.5, new AbortController().signal)).rejects.toThrow(
      mode === 'context' ? 'Preview canvas is unavailable.' : 'draw failed'
    );
    expect(source.frames[0]!.close).toHaveBeenCalledOnce();
    expect(source.release).toHaveBeenCalledOnce();
    expect(source.video.currentTime).toBe(0);
  }
);

it('propagates decode failure without using HTML compatibility', async () => {
  const source = canonicalSource();
  const failure = new Error('decode failed');
  canonical.acquire.mockRejectedValueOnce(failure);
  await expect(source.load(0.5, new AbortController().signal)).rejects.toBe(failure);
  expect(source.draw).not.toHaveBeenCalled();
  expect(source.source.toVideoFrame).not.toHaveBeenCalled();
  expect(source.video.currentTime).toBe(0);
  await expect(source.load(0.5, new AbortController().signal)).resolves.toMatchObject({
    width: 800,
    height: 400,
  });
  expect(source.release).toHaveBeenCalledOnce();
});

function compatibleSource() {
  const source = canonicalSource();
  canonical.acquire.mockResolvedValue(null);
  const lease = {
    bindings: new Map([
      [
        'zoom-preview',
        {
          membership: 'packet-floor' as const,
          source: source.source,
          target: 0.5,
          timestamp: 0.3,
          url: 'blob:preview',
        },
      ],
    ]),
    release: source.release,
  };
  compatible.acquire.mockResolvedValue(lease);
  return { ...source, compatibleLease: lease };
}

it('normalizes verified compatibility after actual provider null and preserves EOF evidence', async () => {
  const f = compatibleSource();
  compatible.acquire.mockResolvedValueOnce({
    bindings: new Map([
      [
        'zoom-preview',
        {
          ...f.compatibleLease.bindings.get('zoom-preview')!,
          target: 13,
          heldAtEnd: true,
          heldSourceEnd: 0.7,
        },
      ],
    ]),
    release: f.release,
  });
  const frame = await f.load(13, new AbortController().signal);
  expect(frame.selection).toEqual({
    membership: 'packet-floor',
    url: 'blob:preview',
    target: 13,
    timestamp: 0.3,
    heldAtEnd: true,
    heldSourceEnd: 0.7,
  });
  expect(frame.selection).not.toHaveProperty('nextTimestamp');
  expect(f.release).toHaveBeenCalledOnce();
  expect(f.frames[0]!.close).toHaveBeenCalledOnce();
});

it.each(['leading', 'terminal'] as const)(
  'preserves %s selection facts without escaping a lease',
  async (mode) => {
    const source = canonicalSource();
    const target = mode === 'leading' ? 0 : 13;
    const facts = mode === 'leading' ? { sampleTime: 0.3 } : { heldAtEnd: true as const };
    canonical.acquire.mockResolvedValueOnce({
      bindings: new Map([
        [
          'zoom-preview',
          {
            source: source.source,
            timestamp: 0.3,
            nextTimestamp: 0.7,
            target,
            url: 'blob:preview',
            ...facts,
          },
        ],
      ]),
      release: source.release,
    });
    const frame = await source.load(target, new AbortController().signal);
    expect(frame.selection).toEqual({
      timestamp: 0.3,
      nextTimestamp: 0.7,
      target,
      url: 'blob:preview',
      ...facts,
    });
    expect(frame.selection).not.toHaveProperty('source');
    expect(Object.isFrozen(frame.selection)).toBe(true);
    expect(source.release).toHaveBeenCalledOnce();
  }
);

it('keeps returned RGB canvases intact after another load and source disposal', async () => {
  const source = canonicalSource();
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockRestore();
  source.draw.mockImplementation((context) => {
    context.fillStyle = '#2385ad';
    context.fillRect(0, 0, 800, 400);
  });
  const first = await source.load(0.5, new AbortController().signal);
  const second = await source.load(0.5, new AbortController().signal);
  expect(first.image).not.toBe(second.image);
  dispose?.();
  expect(canonical.dispose).toHaveBeenCalledOnce();
  expect(source.release).toHaveBeenCalledTimes(2);
  for (const frame of [first, second]) {
    expect(frame.image).toBeInstanceOf(HTMLCanvasElement);
    if (!(frame.image instanceof HTMLCanvasElement)) throw new Error('Expected owned RGB canvas.');
    expect(frame.image.width).toBe(800);
    expect(frame.image.height).toBe(400);
    expect(Array.from(frame.image.getContext('2d')!.getImageData(10, 10, 1, 1).data)).toEqual([
      35, 133, 173, 255,
    ]);
  }
  expect(source.frames.every((frame) => vi.mocked(frame.close).mock.calls.length === 1)).toBe(true);
});

it('serializes native acquisition until the preceding copy and release finish', async () => {
  const source = canonicalSource();
  const gate = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const normalize = normalization.prepareDecodedVideoSample;
  vi.spyOn(normalization, 'prepareDecodedVideoSample').mockImplementationOnce(
    async (sample, signal) => {
      started.resolve();
      await gate.promise;
      return normalize(sample, signal);
    }
  );
  const first = source.load(0.5, new AbortController().signal);
  await started.promise;
  const second = source.load(0.5, new AbortController().signal);
  await Promise.resolve();
  expect(canonical.acquire).toHaveBeenCalledOnce();
  expect(source.release).not.toHaveBeenCalled();
  gate.resolve();
  const a = await first;
  const b = await second;
  expect(a.image).not.toBe(b.image);
  expect(canonical.acquire).toHaveBeenCalledTimes(2);
  expect(source.release).toHaveBeenCalledTimes(2);
});

it.each(['missing-binding', 'missing-accessor'] as const)(
  'rejects %s and releases the lease without HTML substitution',
  async (mode) => {
    const source = canonicalSource();
    const drawOnly = { sourceWidth: 800, sourceHeight: 400, draw: vi.fn() };
    const binding = { ...source.lease.bindings.get('zoom-preview')!, source: drawOnly };
    canonical.acquire.mockResolvedValueOnce({
      bindings: new Map(mode === 'missing-binding' ? [] : [['zoom-preview', binding]]),
      release: source.release,
    });
    await expect(source.load(0.5, new AbortController().signal)).rejects.toThrow(
      'Preview source binding is unavailable.'
    );
    expect(source.release).toHaveBeenCalledOnce();
    expect(source.source.toVideoFrame).not.toHaveBeenCalled();
    expect(source.draw).not.toHaveBeenCalled();
    expect(source.video.currentTime).toBe(0);
  }
);

function mountSelectedFrame(load: ZoomPreviewFrameLoader | null, time: number | null) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  let current: ReturnType<typeof useZoomPreviewFrame>;
  function Probe(props: { load: ZoomPreviewFrameLoader | null; time: number | null }) {
    current = useZoomPreviewFrame(props.load, props.time);
    return null;
  }
  const render = (nextLoad: ZoomPreviewFrameLoader | null, nextTime: number | null) =>
    act(async () => root.render(<Probe load={nextLoad} time={nextTime} />));
  act(() => root.render(<Probe load={load} time={time} />));
  const unmount = () => {
    act(() => root.unmount());
    dispose = undefined;
  };
  dispose = unmount;
  return {
    get current() {
      return current;
    },
    render,
    unmount,
  };
}

it('reports unavailable, loading and ready for selected RGB frames', async () => {
  const gate = Promise.withResolvers<ZoomPreviewFrame>();
  const load = vi.fn<ZoomPreviewFrameLoader>(() => gate.promise);
  const view = mountSelectedFrame(null, null);
  expect(view.current.status).toBe('unavailable');
  await view.render(load, null);
  expect(view.current.status).toBe('unavailable');
  expect(load).not.toHaveBeenCalled();
  await view.render(load, 1);
  expect(view.current.status).toBe('loading');
  expect(view.current.frame).toBeNull();
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const frame = { image: canvas, width: 640, height: 360 };
  await act(async () => gate.resolve(frame));
  expect(view.current.status).toBe('ready');
  expect(view.current.frame).toBe(frame);
  await view.render(load, 1);
  expect(load).toHaveBeenCalledExactlyOnceWith(1, expect.any(AbortSignal));
  expect(view.current.frame?.image).toBe(canvas);
});

it('ignores stale time and loader completions after selection replacement', async () => {
  const oldTime = Promise.withResolvers<ZoomPreviewFrame>();
  const oldLoader = Promise.withResolvers<ZoomPreviewFrame>();
  const selected = Promise.withResolvers<ZoomPreviewFrame>();
  const load = vi
    .fn<ZoomPreviewFrameLoader>()
    .mockReturnValueOnce(oldTime.promise)
    .mockReturnValueOnce(oldLoader.promise);
  const nextLoad = vi.fn<ZoomPreviewFrameLoader>(() => selected.promise);
  const view = mountSelectedFrame(load, 1);
  const firstSignal = load.mock.calls[0]![1];
  await view.render(load, 2);
  expect(firstSignal.aborted).toBe(true);
  const secondSignal = load.mock.calls[1]![1];
  await view.render(nextLoad, 2);
  expect(secondSignal.aborted).toBe(true);
  await act(async () =>
    oldTime.resolve({ image: document.createElement('canvas'), width: 10, height: 10 })
  );
  expect(view.current.status).toBe('loading');
  expect(view.current.frame).toBeNull();
  await act(async () => oldLoader.reject(new Error('obsolete read failed')));
  expect(view.current.status).toBe('loading');
  const frame = { image: document.createElement('canvas'), width: 640, height: 360 };
  await act(async () => selected.resolve(frame));
  expect(view.current.status).toBe('ready');
  expect(view.current.frame).toBe(frame);
});

it('recovers on retry and ignores a pending completion after unmount', async () => {
  const failed = Promise.withResolvers<ZoomPreviewFrame>();
  const retried = Promise.withResolvers<ZoomPreviewFrame>();
  const late = Promise.withResolvers<ZoomPreviewFrame>();
  const load = vi
    .fn<ZoomPreviewFrameLoader>()
    .mockReturnValueOnce(failed.promise)
    .mockReturnValueOnce(retried.promise)
    .mockReturnValueOnce(late.promise);
  const view = mountSelectedFrame(load, 1);
  await act(async () => failed.reject(new Error('source unavailable')));
  expect(view.current.status).toBe('failed');
  expect(view.current.frame).toBeNull();
  await act(async () => view.current.retry());
  expect(view.current.status).toBe('loading');
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const frame = { image: canvas, width: 640, height: 360 };
  await act(async () => retried.resolve(frame));
  expect(view.current.status).toBe('ready');
  expect(view.current.frame).toBe(frame);
  await view.render(load, 2);
  const beforeUnmount = view.current;
  const signal = load.mock.calls[2]![1];
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () =>
    late.resolve({ image: document.createElement('canvas'), width: 10, height: 10 })
  );
  expect(view.current).toBe(beforeUnmount);
  expect(canvas.width).toBe(640);
  expect(canvas.height).toBe(360);
});

it('loads owned RGB when VideoFrame is absent and preserves the completed canvas', async () => {
  const f = mountSource();
  vi.stubGlobal('VideoFrame', undefined);
  const result = await f.load(0, new AbortController().signal);
  expect(result.image).toBeInstanceOf(HTMLCanvasElement);
  expect(result.width).toBe(640);
  expect(result.selection).toBeUndefined();
  const canvas = result.image as HTMLCanvasElement;
  dispose?.();
  expect(canvas.width).toBe(640);
  expect(canvas.height).toBe(360);
});

it.each(['declined', 'decoder-absent'] as const)(
  'copies verified paused focus pixels and packet-floor provenance when %s',
  async (mode) => {
    const f = canonicalSource();
    canonical.acquire.mockResolvedValue(null);
    if (mode === 'decoder-absent') vi.stubGlobal('VideoDecoder', undefined);
    compatible.acquire.mockResolvedValue({
      bindings: new Map([
        [
          'zoom-preview',
          {
            membership: 'packet-floor',
            source: f.source,
            target: 0.5,
            timestamp: 0.3,
            url: 'blob:preview',
          },
        ],
      ]),
      release: f.release,
    });
    f.video.currentTime = 99;
    const pending = f.load(0.5, new AbortController().signal);
    void pending.catch(() => undefined);
    await vi.waitFor(() => expect(compatible.acquire).toHaveBeenCalledOnce());
    const frame = await pending;
    expect(frame.selection).toEqual({
      membership: 'packet-floor',
      target: 0.5,
      timestamp: 0.3,
      url: 'blob:preview',
    });
    expect(frame.selection).not.toHaveProperty('nextTimestamp');
    expect(frame).toMatchObject({ width: 800, height: 400 });
    expect(f.video.currentTime).toBe(99);
    expect(f.release).toHaveBeenCalledOnce();
  }
);
