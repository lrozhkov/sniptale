import { VideoSample } from 'mediabunny';
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createProject,
  createVideoClip,
} from '../../../../features/video/project/timeline/project-meta.test.helpers';
import { createVideoPreviewExactFrameCache } from '../../cache/exact-frame-cache';
import { createPreviewEffectRuntimeFeedbackTestStub } from '../scene/test-support';
import { usePreviewStageMediaRuntime } from './runtime';
import { useNativePreviewSourceRuntime, type NativePreviewSourceRuntime } from './source-runtime';
import * as sourceProvider from '../../../../workflows/video/preview-source';
import * as htmlSource from './html-source';
import type {
  PreviewSourceLease,
  PreviewSourceProvider,
} from '../../../../workflows/video/preview-source';

vi.mock('../runtime/playback/prepare', () => ({
  usePreviewStagePlaybackPreviewRuntime: () => ({
    cachedVideo: null,
    previewStatus: { completedFrames: 0, mode: 'live', phase: 'idle', totalFrames: 0 },
  }),
}));
vi.mock('../runtime/effect-audio', () => ({ usePreviewEffectAudio: () => undefined }));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('VideoDecoder', class {});
  vi.stubGlobal('VideoFrame', class {});
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each([
  ['gpu', true, 'live'],
  ['gpu', false, 'live'],
  ['legacy', true, 'live'],
  ['legacy', false, 'live'],
  ['gpu', false, 'cache'],
  ['legacy', false, 'cache'],
] as const)(
  'preserves %s source routing with playing=%s and mode=%s',
  async (renderer, playing, mode) => {
    const clip = createVideoClip();
    const project = createProject([clip]);
    project.assets[0]!.metadata.hasAudio = false;
    const video = document.createElement('video');
    const seek = vi.fn();
    const play = vi.fn(async () => undefined);
    Object.defineProperties(video, {
      currentTime: { configurable: true, get: () => 0, set: seek },
      readyState: { configurable: true, value: 4 },
      duration: { configurable: true, value: 8 },
      paused: { configurable: true, value: true },
      play: { configurable: true, value: play },
      pause: { configurable: true, value: vi.fn() },
    });
    const cache = createVideoPreviewExactFrameCache(1024 * 1024);
    let current: ReturnType<typeof usePreviewStageMediaRuntime> | undefined;
    function Harness() {
      current = usePreviewStageMediaRuntime({
        activeClips: [clip],
        assetUrls: { [clip.assetId]: 'blob:source-fixture' },
        currentTime: 2,
        effectRuntimeFeedback: createPreviewEffectRuntimeFeedbackTestStub(),
        isPlaying: playing,
        onPresentationTime: vi.fn(),
        playbackRange: null,
        previewExactFrameCache: cache,
        previewMode: mode,
        previewRenderer: renderer,
        previewRasterSize: { width: 1280, height: 720 },
        project,
        renderGenerationRef: { current: 0 },
        registerPreviewRuntime: vi.fn(),
      });
      current.videoRefs.current[clip.id] = video;
      return null;
    }
    await act(async () => root.render(<Harness />));
    expect(play).not.toHaveBeenCalled();
    if (mode === 'cache') {
      expect(current?.sourceRuntime.selected).toBe(false);
      expect(current?.videoBankClips).toEqual([clip]);
      expect(seek).toHaveBeenCalledWith(2);
    } else {
      expect(seek).not.toHaveBeenCalled();
      expect(current?.sourceRuntime.selected).toBe(true);
      expect(current?.videoBankClips).toEqual([]);
    }
  }
);

function sourceLease(): PreviewSourceLease {
  return { bindings: new Map(), release: vi.fn() };
}

function mockProvider() {
  const acquire = vi.fn<PreviewSourceProvider['acquire']>().mockResolvedValue(sourceLease());
  const provider: PreviewSourceProvider = {
    acquire,
    retainSources: vi.fn(),
    dispose: vi.fn(),
  };
  const factory = vi.spyOn(sourceProvider, 'createPreviewSourceProvider').mockReturnValue(provider);
  return { acquire, provider, factory };
}

function sourceParams() {
  return {
    project: createProject([createVideoClip()]),
    assetUrls: { 'asset-video': 'blob:source-fixture' },
    enabled: true,
    retryVersion: 0,
  };
}

function SourceHarness({
  params,
  capture,
}: {
  params: Parameters<typeof useNativePreviewSourceRuntime>[0];
  capture(value: NativePreviewSourceRuntime): void;
}) {
  capture(useNativePreviewSourceRuntime(params));
  return null;
}

it('keeps the physical provider across effect-only edits while rejecting old logical requests', async () => {
  const { factory, provider, acquire } = mockProvider();
  const params = sourceParams();
  const firstLease = sourceLease();
  const secondLease = sourceLease();
  acquire.mockResolvedValueOnce(firstLease).mockResolvedValueOnce(secondLease);
  let current: NativePreviewSourceRuntime | undefined;
  const capture = (value: NativePreviewSourceRuntime) => {
    current = value;
  };
  await act(async () => root.render(<SourceHarness params={params} capture={capture} />));
  const original = current!;
  const signal = new AbortController().signal;
  const demands = [{ id: 'clip-video', url: 'blob:source-fixture', time: 2 }];
  expect(await original.acquire(demands, signal)).toBe(firstLease);
  const edited = { ...params, project: { ...params.project, backgroundColor: '#123456' } };
  await act(async () => root.render(<SourceHarness params={edited} capture={capture} />));
  await expect(original.acquire(demands, signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(firstLease.release).not.toHaveBeenCalled();
  const pausedDemands = [{ ...demands[0]!, time: 3 }];
  expect(await current!.acquire(pausedDemands, signal, { discontinuity: true })).toBe(secondLease);
  expect(acquire).toHaveBeenLastCalledWith(pausedDemands, signal, { discontinuity: true });
  expect(factory).toHaveBeenCalledOnce();
  expect(provider.dispose).not.toHaveBeenCalled();
  firstLease.release();
  secondLease.release();
});

it('releases a late result after logical project replacement', async () => {
  const { acquire } = mockProvider();
  const pendingLease = Promise.withResolvers<PreviewSourceLease | null>();
  acquire.mockReturnValueOnce(pendingLease.promise);
  const params = sourceParams();
  let current: NativePreviewSourceRuntime | undefined;
  const capture = (value: NativePreviewSourceRuntime) => {
    current = value;
  };
  await act(async () => root.render(<SourceHarness params={params} capture={capture} />));
  const pending = current!.acquire([], new AbortController().signal);
  const edited = { ...params, project: { ...params.project, updatedAt: 3 } };
  await act(async () => root.render(<SourceHarness params={edited} capture={capture} />));
  const lease = sourceLease();
  pendingLease.resolve(lease);
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(lease.release).toHaveBeenCalledOnce();
});

it('primes exact nominal mapping and releases only its own lease', async () => {
  const { acquire } = mockProvider();
  const lease = sourceLease();
  acquire.mockResolvedValueOnce(lease);
  const params = sourceParams();
  params.project = createProject([createVideoClip({ sourceStart: 1 })]);
  let current: NativePreviewSourceRuntime | undefined;
  await act(async () =>
    root.render(
      <SourceHarness
        params={params}
        capture={(value) => {
          current = value;
        }}
      />
    )
  );
  const signal = new AbortController().signal;
  expect(await current!.prepare(2, signal)).toBe('ready');
  expect(acquire).toHaveBeenCalledWith(
    [{ id: 'clip-video', url: 'blob:source-fixture', time: 3, rangeStart: 1, rangeEnd: 9 }],
    signal,
    { discontinuity: true }
  );
  expect(lease.release).toHaveBeenCalledOnce();
});

it('keeps the managed bank empty through pending HTML admission after upfront decline', async () => {
  const entered = Promise.withResolvers<void>();
  const admission = Promise.withResolvers<PreviewSourceLease>();
  const htmlAcquire = vi.fn().mockImplementation(async () => sourceLease());
  htmlAcquire.mockImplementationOnce(() => {
    entered.resolve();
    return admission.promise;
  });
  vi.spyOn(htmlSource, 'createNativeHtmlSourceProvider').mockReturnValue({
    acquire: htmlAcquire,
    retainSources: vi.fn(),
    dispose: vi.fn(),
  });
  const { acquire } = mockProvider();
  acquire.mockResolvedValueOnce(null);
  const clip = createVideoClip();
  const params = sourceParams();
  const cache = createVideoPreviewExactFrameCache(1024 * 1024);
  let current: ReturnType<typeof usePreviewStageMediaRuntime> | undefined;
  function Harness() {
    current = usePreviewStageMediaRuntime({
      activeClips: [clip],
      assetUrls: params.assetUrls,
      currentTime: 2,
      effectRuntimeFeedback: createPreviewEffectRuntimeFeedbackTestStub(),
      isPlaying: false,
      onPresentationTime: vi.fn(),
      playbackRange: null,
      previewExactFrameCache: cache,
      previewMode: 'live',
      previewRenderer: 'gpu',
      previewRasterSize: { width: 1280, height: 720 },
      project: params.project,
      renderGenerationRef: { current: 0 },
      registerPreviewRuntime: vi.fn(),
    });
    return null;
  }
  await act(async () => root.render(<Harness />));
  expect(current!.videoBankClips).toEqual([]);
  const precise = current!.sourceRuntime;
  const pending = precise.prepare(2, new AbortController().signal);
  await entered.promise;
  expect(current!.sourceRuntime.selected).toBe(true);
  expect(current!.videoBankClips).toEqual([]);
  let result: 'ready' | 'retry' | undefined;
  await act(async () => {
    admission.resolve(sourceLease());
    result = await pending;
  });
  expect(result).toBe('ready');
  expect(current!.sourceRuntime.selected).toBe(true);
  expect(current!.videoBankClips).toEqual([]);
  expect(await precise.prepare(2, new AbortController().signal)).toBe('ready');
  expect(await current!.sourceRuntime.prepare(2, new AbortController().signal)).toBe('ready');
  expect(acquire).toHaveBeenCalledOnce();
});

it('rejects retained runtime callbacks after unmount without closing a caller-owned lease', async () => {
  const { acquire, provider } = mockProvider();
  const lease = sourceLease();
  acquire.mockResolvedValueOnce(lease);
  let current: NativePreviewSourceRuntime | undefined;
  await act(async () =>
    root.render(
      <SourceHarness
        params={sourceParams()}
        capture={(value) => {
          current = value;
        }}
      />
    )
  );
  const original = current!;
  expect(await original.acquire([], new AbortController().signal)).toBe(lease);
  await act(async () => root.render(null));
  expect(provider.dispose).toHaveBeenCalledOnce();
  expect(lease.release).not.toHaveBeenCalled();
  await expect(original.acquire([], new AbortController().signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  lease.release();
});

it('suspends the precise provider when source acquisition is disabled', async () => {
  const { provider } = mockProvider();
  const params = sourceParams();
  let current: NativePreviewSourceRuntime | undefined;
  const capture = (value: NativePreviewSourceRuntime) => {
    current = value;
  };
  await act(async () => root.render(<SourceHarness params={params} capture={capture} />));
  const lease = await current!.acquire([], new AbortController().signal);
  lease?.release();
  await act(async () =>
    root.render(<SourceHarness params={{ ...params, enabled: false }} capture={capture} />)
  );
  expect(current!.selected).toBe(false);
  expect(provider.dispose).toHaveBeenCalledOnce();
});

it('retires the previous project decoder even before the new project requests frames', async () => {
  const { provider } = mockProvider();
  const params = sourceParams();
  let current: NativePreviewSourceRuntime | undefined;
  const capture = (value: NativePreviewSourceRuntime) => {
    current = value;
  };
  await act(async () => root.render(<SourceHarness params={params} capture={capture} />));
  const lease = await current!.acquire([], new AbortController().signal);
  lease?.release();
  await act(async () =>
    root.render(
      <SourceHarness
        params={{ ...params, project: { ...params.project, id: 'replacement' } }}
        capture={capture}
      />
    )
  );
  expect(provider.dispose).toHaveBeenCalledOnce();
});

it('retains physical inputs across demand contraction and retires only removed bindings', async () => {
  const retired = new Map<string, ReturnType<typeof vi.fn>>();
  const open = vi.fn(async (url: string) => {
    const dispose = vi.fn();
    retired.set(url, dispose);
    return {
      end: 8,
      async *samples() {
        for (const timestamp of [0, 1, 2, 3])
          yield new VideoSample(new Uint8Array(16), {
            format: 'RGBA',
            codedWidth: 2,
            codedHeight: 2,
            timestamp,
          });
      },
      dispose,
    };
  });
  const provider = sourceProvider.createPreviewSourceProvider({ open });
  vi.spyOn(sourceProvider, 'createPreviewSourceProvider').mockReturnValue(provider);
  const params = {
    ...sourceParams(),
    assetUrls: { 'asset-video': 'blob:source-fixture', 'asset-other': 'blob:other' },
  };
  let runtime = await mountedSourceRuntime(params);
  const signal = new AbortController().signal;
  for (const url of ['blob:source-fixture', 'blob:other']) {
    const lease = await runtime.acquire([{ id: url, url, time: 0.5 }], signal);
    lease?.release();
  }
  const empty = await runtime.acquire([], signal);
  empty?.release();
  const resumed = await runtime.acquire(
    [{ id: 'resumed', url: 'blob:source-fixture', time: 0.5 }],
    signal
  );
  resumed?.release();
  expect(open).toHaveBeenCalledTimes(2);
  expect(retired.get('blob:source-fixture')).not.toHaveBeenCalled();
  expect(retired.get('blob:other')).not.toHaveBeenCalled();
  runtime = await mountedSourceRuntime({
    ...params,
    assetUrls: { 'asset-other': 'blob:other' },
  });
  expect(retired.get('blob:source-fixture')).toHaveBeenCalledOnce();
  expect(retired.get('blob:other')).not.toHaveBeenCalled();
  const remaining = await runtime.acquire(
    [{ id: 'remaining', url: 'blob:other', time: 1.5 }],
    signal
  );
  remaining?.release();
  expect(open).toHaveBeenCalledTimes(2);
});

function controlledReadinessProvider() {
  const entered = Promise.withResolvers<void>();
  const unblock = Promise.withResolvers<void>();
  const provider = sourceProvider.createPreviewSourceProvider({
    open: async () => ({
      end: 20,
      async *samples(start: number) {
        const times =
          start < 1 ? [0, 0.1, 11.483333, 11.5, 11.516667] : [11.483333, 11.5, 11.516667];
        for (let index = 0; index < times.length; index++) {
          if (start < 1 && index === 1) {
            entered.resolve();
            await unblock.promise;
          }
          yield new VideoSample(new Uint8Array(16), {
            format: 'RGBA',
            codedWidth: 2,
            codedHeight: 2,
            timestamp: times[index]!,
            duration: 0.016667,
          });
        }
      },
      dispose: vi.fn(),
    }),
  });
  const realAcquire = provider.acquire.bind(provider);
  const releases = new Map<string, ReturnType<typeof vi.fn>>();
  const acquire = vi
    .spyOn(provider, 'acquire')
    .mockImplementation(async (demands, signal, options) => {
      const lease = await realAcquire(demands, signal, options);
      if (!lease) return null;
      const release = vi.fn(lease.release);
      for (const demand of demands) releases.set(demand.id, release);
      return { bindings: lease.bindings, release };
    });
  vi.spyOn(sourceProvider, 'createPreviewSourceProvider').mockReturnValue(provider);
  return { entered, unblock, acquire, releases };
}
it.each(['scene-first', 'prime-first'] as const)(
  'coordinates matching seek readiness with actual core (%s)',
  async (order) => {
    const f = controlledReadinessProvider();
    const params = sourceParams();
    params.project = createProject([createVideoClip({ duration: 20, sourceDuration: 20 })]);
    let runtime: NativePreviewSourceRuntime | undefined;
    await act(async () =>
      root.render(
        <SourceHarness
          params={params}
          capture={(value) => {
            runtime = value;
          }}
        />
      )
    );
    const signal = () => new AbortController().signal;
    const seed = runtime!.acquire(
      [{ id: 'seed', url: 'blob:source-fixture', time: 0.05 }],
      signal()
    );
    await f.entered.promise;
    const target = 11.499937;
    const demands = [
      { id: 'scene-nominal', url: 'blob:source-fixture', time: target },
      { id: 'scene-exposure', url: 'blob:source-fixture', time: 11.51 },
    ];
    let scene: ReturnType<NativePreviewSourceRuntime['acquire']>;
    let prime: Promise<'ready' | 'retry'>;
    if (order === 'scene-first') {
      scene = runtime!.acquire(demands, signal(), { discontinuity: true });
      prime = runtime!.prepare(target, signal());
    } else {
      prime = runtime!.prepare(target, signal());
      scene = runtime!.acquire(demands, signal(), { discontinuity: true });
    }
    const sceneResult = scene.then(
      (lease) => ({ lease }),
      (error) => ({ error })
    );
    const primeResult = prime.then(
      (value) => value,
      (error) => error
    );
    f.unblock.resolve();
    const [sceneValue, primeValue, seedLease] = await Promise.all([sceneResult, primeResult, seed]);
    try {
      expect(sceneValue).toHaveProperty('lease');
      expect(primeValue).toBe(order === 'scene-first' ? 'ready' : 'retry');
      expect(f.acquire).toHaveBeenCalledTimes(order === 'scene-first' ? 2 : 3);
      expect(f.releases.get('scene-nominal')).not.toHaveBeenCalled();
      if ('lease' in sceneValue)
        expect(sceneValue.lease?.bindings.get('scene-nominal')).toMatchObject({
          timestamp: 11.483333,
          nextTimestamp: 11.5,
        });
    } finally {
      seedLease?.release();
      if ('lease' in sceneValue) sceneValue.lease?.release();
    }
  }
);

async function mountedSourceRuntime(
  params: Parameters<typeof useNativePreviewSourceRuntime>[0] = sourceParams()
) {
  let current: NativePreviewSourceRuntime | undefined;
  await act(async () =>
    root.render(
      <SourceHarness
        params={params}
        capture={(value) => {
          current = value;
        }}
      />
    )
  );
  if (!current) throw new Error('Expected mounted source runtime');
  return current;
}
it('aborts only a readiness observer while its matching Scene retains its lease', async () => {
  const f = mockProvider();
  const gate = Promise.withResolvers<PreviewSourceLease | null>();
  f.acquire.mockReturnValueOnce(gate.promise);
  const runtime = await mountedSourceRuntime();
  const sceneSignal = new AbortController();
  const waiter = new AbortController();
  const scene = runtime.acquire(
    [{ id: 'render', url: 'blob:source-fixture', time: 2 }],
    sceneSignal.signal
  );
  const ready = runtime.prepare(2, waiter.signal);
  waiter.abort();
  await expect(ready).rejects.toMatchObject({ name: 'AbortError' });
  expect(sceneSignal.signal.aborted).toBe(false);
  expect(f.acquire).toHaveBeenCalledOnce();
  const lease = sourceLease();
  gate.resolve(lease);
  expect(await scene).toBe(lease);
  expect(lease.release).not.toHaveBeenCalled();
  lease.release();
});
it.each(['target', 'url'] as const)(
  'does not join Scene readiness with a different %s',
  async (difference) => {
    const f = mockProvider();
    const gate = Promise.withResolvers<PreviewSourceLease | null>();
    const ownLease = sourceLease();
    f.acquire.mockReturnValueOnce(gate.promise).mockResolvedValueOnce(ownLease);
    const runtime = await mountedSourceRuntime();
    const scene = runtime.acquire(
      [
        {
          id: 'clip-video',
          url: difference === 'url' ? 'blob:other' : 'blob:source-fixture',
          time: difference === 'target' ? 1 : 2,
        },
      ],
      new AbortController().signal
    );
    expect(await runtime.prepare(2, new AbortController().signal)).toBe('ready');
    expect(f.acquire).toHaveBeenCalledTimes(2);
    expect(ownLease.release).toHaveBeenCalledOnce();
    const sceneLease = sourceLease();
    gate.resolve(sceneLease);
    await scene;
    expect(sceneLease.release).not.toHaveBeenCalled();
    sceneLease.release();
  }
);
it.each([
  new Error('Preview source frame is unavailable.'),
  new DOMException('Decoder read was aborted.', 'AbortError'),
  new DOMException('Preview source request was cancelled.', 'AbortError'),
])('propagates a real failure despite a matching Scene handoff: %s', async (failure) => {
  const f = mockProvider();
  const primeGate = Promise.withResolvers<PreviewSourceLease | null>();
  const sceneGate = Promise.withResolvers<PreviewSourceLease | null>();
  f.acquire.mockReturnValueOnce(primeGate.promise).mockReturnValueOnce(sceneGate.promise);
  const runtime = await mountedSourceRuntime();
  const prime = runtime.prepare(2, new AbortController().signal);
  const scene = runtime.acquire(
    [{ id: 'render', url: 'blob:source-fixture', time: 2 }],
    new AbortController().signal
  );
  primeGate.reject(failure);
  await expect(prime).rejects.toBe(failure);
  const lease = sourceLease();
  sceneGate.resolve(lease);
  await scene;
  expect(lease.release).not.toHaveBeenCalled();
  lease.release();
});
it('propagates matching Scene decode failure without another request', async () => {
  const f = mockProvider();
  const gate = Promise.withResolvers<PreviewSourceLease | null>();
  f.acquire.mockReturnValueOnce(gate.promise);
  const runtime = await mountedSourceRuntime();
  const failure = new Error('Preview source frame is unavailable.');
  const scene = runtime
    .acquire([{ id: 'render', url: 'blob:source-fixture', time: 2 }], new AbortController().signal)
    .catch((error) => error);
  const ready = runtime.prepare(2, new AbortController().signal);
  gate.reject(failure);
  await expect(ready).rejects.toBe(failure);
  expect(await scene).toBe(failure);
  expect(f.acquire).toHaveBeenCalledOnce();
});
it.each(['edit', 'unmount'] as const)('does not publish readiness after Scene %s', async (kind) => {
  const f = mockProvider();
  const gate = Promise.withResolvers<PreviewSourceLease | null>();
  f.acquire.mockReturnValueOnce(gate.promise);
  const params = sourceParams();
  const runtime = await mountedSourceRuntime(params);
  const scene = runtime
    .acquire([{ id: 'render', url: 'blob:source-fixture', time: 2 }], new AbortController().signal)
    .catch((error) => error);
  const ready = runtime.prepare(2, new AbortController().signal);
  if (kind === 'unmount') await act(async () => root.render(null));
  else
    await mountedSourceRuntime({
      ...params,
      project: { ...params.project, backgroundColor: '#123456' },
    });
  const lease = sourceLease();
  gate.resolve(lease);
  await expect(ready).rejects.toMatchObject({ name: 'AbortError' });
  expect(await scene).toMatchObject({ name: 'AbortError' });
  expect(lease.release).toHaveBeenCalledOnce();
});
it('shares HTML admission with matching Scene readiness after canonical decline', async () => {
  const htmlLease = sourceLease();
  const htmlAcquire = vi.fn().mockResolvedValue(htmlLease);
  vi.spyOn(htmlSource, 'createNativeHtmlSourceProvider').mockReturnValue({
    acquire: htmlAcquire,
    retainSources: vi.fn(),
    dispose: vi.fn(),
  });
  const f = mockProvider();
  const gate = Promise.withResolvers<PreviewSourceLease | null>();
  f.acquire.mockReturnValueOnce(gate.promise);
  const params = sourceParams();
  let runtime: NativePreviewSourceRuntime | undefined;
  await act(async () =>
    root.render(
      <SourceHarness
        params={params}
        capture={(value) => {
          runtime = value;
        }}
      />
    )
  );
  const scene = runtime!.acquire(
    [{ id: 'render', url: 'blob:source-fixture', time: 2 }],
    new AbortController().signal
  );
  const ready = runtime!.prepare(2, new AbortController().signal);
  await act(async () => {
    gate.resolve(null);
    expect(await scene).toBe(htmlLease);
    expect(await ready).toBe('ready');
  });
  expect(runtime!.selected).toBe(true);
  expect(htmlAcquire).toHaveBeenCalledOnce();
  expect(htmlLease.release).not.toHaveBeenCalled();
  htmlLease.release();
  expect(f.acquire).toHaveBeenCalledOnce();
});
it('does not enqueue an empty nominal readiness request', async () => {
  const f = mockProvider();
  const runtime = await mountedSourceRuntime({ ...sourceParams(), project: createProject([]) });
  expect(await runtime.prepare(2, new AbortController().signal)).toBe('ready');
  expect(f.acquire).not.toHaveBeenCalled();
});

it.each(['different-target', 'outer-abort'] as const)(
  'preserves actual core cancellation for %s',
  async (kind) => {
    const f = controlledReadinessProvider();
    const params = sourceParams();
    params.project = createProject([createVideoClip({ duration: 20, sourceDuration: 20 })]);
    const runtime = await mountedSourceRuntime(params);
    const seed = runtime.acquire(
      [{ id: 'seed', url: 'blob:source-fixture', time: 0.05 }],
      new AbortController().signal
    );
    await f.entered.promise;
    const controller = new AbortController();
    const prime = runtime
      .prepare(kind === 'different-target' ? 2 : 11.499937, controller.signal)
      .then(
        (value) => value,
        (error) => error
      );
    const scene = runtime.acquire(
      [{ id: 'render', url: 'blob:source-fixture', time: 11.499937 }],
      new AbortController().signal,
      { discontinuity: true }
    );
    if (kind === 'outer-abort') controller.abort();
    f.unblock.resolve();
    const [primeResult, sceneLease, seedLease] = await Promise.all([prime, scene, seed]);
    try {
      expect(primeResult).toMatchObject({ name: 'AbortError' });
      expect(f.releases.get('render')).not.toHaveBeenCalled();
    } finally {
      sceneLease?.release();
      seedLease?.release();
    }
  }
);
