// @vitest-environment jsdom
import { reviewPreviewSceneKey } from '../../workflows/video-review/preview-scene';
import * as cameraSources from './webcam-preview';
import { createQuickEditWebcam } from '../../features/video/review/advanced/webcam';
import { afterEach, expect, it, vi } from 'vitest';
import { VideoSample } from 'mediabunny';
import { createManualPresentationOwner } from './preview-presentation-session';
import type {
  PresentationInput,
  Description,
  ReviewPreviewPresentationStatus,
} from './preview-presentation-state';
import { DEFAULT_QUICK_PREVIEW_PREFERENCES } from '../../features/video/preview/quick-preferences';
import type {
  PreviewSourceProvider,
  PreviewSourceLease,
} from '../../workflows/video/preview-source';

type HtmlSourceProvider = ReturnType<
  typeof import('../../workflows/video/preview-html-source').createPreviewHtmlSourceProvider
>;
const io = vi.hoisted(() => ({
  htmlProvider:
    vi.fn<
      typeof import('../../workflows/video/preview-html-source').createPreviewHtmlSourceProvider
    >(),
  provider:
    vi.fn<typeof import('../../workflows/video/preview-source').createPreviewSourceProvider>(),
  scheduler: vi.fn<typeof import('./preview-presentation').createReviewPreviewPresentation>(),
  decoded: vi.fn<typeof import('./preview-presentation-frame').captureDecodedReviewPreviewFrame>(),
  legacy: vi.fn<typeof import('./preview-presentation-frame').captureReviewPreviewFrame>(),
  disposeRenderer: vi.fn(),
  prepareRenderer: vi.fn<(scene: Description['scene']) => void>(),
}));
vi.mock('../../workflows/video/preview-source', async (original) => ({
  ...(await original<typeof import('../../workflows/video/preview-source')>()),
  createPreviewSourceProvider: io.provider,
}));
vi.mock('../../workflows/video/preview-html-source', () => ({
  createPreviewHtmlSourceProvider: io.htmlProvider,
}));
vi.mock('./preview-presentation', () => ({
  createReviewPresentationPaintClock: () => ({}),
  createReviewPreviewPresentation: io.scheduler,
}));
vi.mock('./preview-presentation-frame', async (original) => ({
  ...(await original<typeof import('./preview-presentation-frame')>()),
  captureReviewPreviewFrame: io.legacy,
  captureDecodedReviewPreviewFrame: io.decoded,
}));
vi.mock('../../workflows/video-review/render-preview', () => ({
  createReviewPreviewRenderer: () => ({
    maximumInFlight: () => 2,
    dispose: io.disposeRenderer,
    prepare: async (scene: Description['scene']) => {
      io.prepareRenderer(scene);
      return {
        generation: 1,
        watermarkBounds: null,
        allocationAssets: {
          headerBitmap: null,
          backgroundBitmap: null,
          watermark: null,
          previousWatermarkCache: null,
        },
        release: vi.fn(),
      };
    },
  }),
}));

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

function sourceSession(
  createProvider?: () => PreviewSourceProvider,
  webcam?: PresentationInput['webcam']
) {
  vi.stubGlobal('VideoDecoder', class {});
  vi.stubGlobal('VideoFrame', class {});
  vi.stubGlobal('navigator', { gpu: {}, userAgent: 'test' });
  io.scheduler.mockReturnValue({ dispose: vi.fn(), invalidate: vi.fn(), update: vi.fn() });
  const binding = {
    source: { sourceWidth: 2, sourceHeight: 2, draw: vi.fn() },
    timestamp: 1.2,
    nextTimestamp: 1.4,
    target: 1.25,
    url: 'blob:fixed-source',
  };
  const lease: PreviewSourceLease = { bindings: new Map([['source', binding]]), release: vi.fn() };
  const captured = {
    value: {
      generation: 1,
      fps: 60,
      sourceTime: 1.25,
      resultTime: 1,
      source: { timestamp: 1.2, backing: { width: 2, height: 2 }, draw: vi.fn() },
    },
    release: vi.fn(),
  };
  io.decoded.mockReturnValue(captured);
  io.legacy.mockReturnValue(captured);
  const acquire = vi.fn<PreviewSourceProvider['acquire']>().mockResolvedValue(lease);
  const provider: PreviewSourceProvider = { acquire, retainSources: vi.fn(), dispose: vi.fn() };
  io.provider.mockImplementation(createProvider ?? (() => provider));
  const htmlBinding = {
    membership: 'packet-floor' as const,
    source: binding.source,
    target: binding.target,
    timestamp: binding.timestamp,
    url: binding.url,
  };
  const htmlLease = { bindings: new Map([['source', htmlBinding]]), release: vi.fn() };
  const htmlAcquire = vi.fn<HtmlSourceProvider['acquire']>().mockResolvedValue(htmlLease);
  const htmlProvider: HtmlSourceProvider = {
    acquire: htmlAcquire,
    retainSources: vi.fn(),
    dispose: vi.fn(),
  };
  io.htmlProvider.mockReturnValue(htmlProvider);
  const video = document.createElement('video');
  Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
  video.currentTime = 1.25;
  const input: PresentationInput = {
    ...(webcam ? { webcam } : {}),
    video: { current: video },
    host: { current: document.createElement('div') },
    sourceIdentity: 'blob:fixed-source',
    scene: {
      source: { width: 2, height: 2 },
      background: { enabled: false },
      zoomRegions: [],
      comments: [],
      keys: [],
      clicks: [],
    },
    canonical: { width: 200, height: 100 },
    css: { width: 200, height: 100 },
    preferences: { ...DEFAULT_QUICK_PREVIEW_PREFERENCES, renderer: 'gpu' },
    playing: true,
    pausedSourceTime: 1.25,
    pausedResultTime: 1,
    sourceToResult: (source) => source - 0.25,
  };
  const description: Description = {
    scene: input.scene,
    dimensions: { canonical: input.canonical, backing: input.canonical },
    cameraTransform: undefined,
    sourceTime: 1.25,
  };
  const report = vi.fn<(status: ReviewPreviewPresentationStatus) => void>();
  const session = createManualPresentationOwner(
    () => ({
      input,
      cut: { plans: [], blend: null, read: () => null, retry: vi.fn(), current: null },
      placement: null,
    }),
    report,
    vi.fn(),
    vi.fn()
  );
  cleanups.push(() => session.dispose());
  const hooks = io.scheduler.mock.calls[0]![0];
  const signal = new AbortController().signal;
  const prepare = () =>
    hooks.prepare({ scene: description, generation: '1', quality: 'selected', time: 1 }, signal);
  return {
    session,
    report,
    hooks,
    input,
    description,
    video,
    binding,
    lease,
    acquire,
    provider,
    htmlProvider,
    htmlAcquire,
    htmlBinding,
    htmlLease,
    captured,
    signal,
    prepare,
  };
}

it('warms a separate incoming decoder and adopts it only at the mapped source jump', async () => {
  const f = sourceSession();
  const speculative = vi.fn<PreviewSourceProvider['acquire']>().mockResolvedValue(f.lease);
  const incoming = {
    acquire: speculative,
    dispose: vi.fn(),
    retainSources: vi.fn(),
  };
  io.provider.mockReturnValueOnce(f.provider).mockReturnValueOnce(incoming);
  f.input.cut = {
    file: new File([], 'clip.webm'),
    duration: 20,
    edits: [{ kind: 'cut', id: 'skip', start: 6, end: 10, requestedStart: 6, requestedEnd: 10 }],
    time: 0,
  };
  let time = 5.5;
  f.input.readPosition = () => ({
    epoch: 2,
    mapRevision: 3,
    resultTime: time,
    source: {
      kind: 'video',
      mediaTime: time < 6 ? time : time + 4,
      sourceTime: time < 6 ? time : time + 4,
      segmentId: time < 6 ? 'video:0' : 'video:2',
    },
    media: null,
  });
  const prepared = await f.prepare();
  await f.hooks.capture(prepared.value, f.hooks.sampleTime(), f.signal);
  expect(f.acquire.mock.lastCall?.[0][0]?.time).toBe(5.5);
  expect(speculative.mock.lastCall?.[0][0]?.time).toBe(10);
  expect(f.provider.dispose).not.toHaveBeenCalled();
  let finishOutgoing!: (lease: PreviewSourceLease) => void;
  f.acquire.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishOutgoing = resolve;
      })
  );
  const outgoing = f.hooks.capture(prepared.value, f.hooks.sampleTime(), f.signal);
  await vi.waitFor(() => expect(f.acquire).toHaveBeenCalledTimes(3));
  time = 6;
  const firstIncoming = await f.hooks.capture(prepared.value, f.hooks.sampleTime(), f.signal);
  expect(speculative.mock.lastCall?.[0][0]?.time).toBe(10);
  expect(speculative).toHaveBeenCalledTimes(2);
  expect(f.provider.dispose).not.toHaveBeenCalled();
  finishOutgoing(f.lease);
  (await outgoing).release();
  expect(f.provider.dispose).toHaveBeenCalledOnce();
  firstIncoming.release();
});

it('cancels and releases an incoming read after replacing the playing scene', async () => {
  const f = sourceSession();
  let resolve!: (lease: PreviewSourceLease) => void;
  const read = vi.fn<PreviewSourceProvider['acquire']>(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const incoming = { acquire: read, dispose: vi.fn(), retainSources: vi.fn() };
  io.provider.mockReturnValueOnce(f.provider).mockReturnValueOnce(incoming);
  f.input.cut = {
    file: new File([], 'clip.webm'),
    duration: 20,
    edits: [{ kind: 'cut', id: 'skip', start: 6, end: 10, requestedStart: 6, requestedEnd: 10 }],
    time: 5.5,
  };
  f.input.readPosition = () => ({
    epoch: 2,
    mapRevision: 3,
    resultTime: 5.5,
    source: { kind: 'video', sourceTime: 5.5, mediaTime: 5.5, segmentId: 'video:0' },
    media: null,
  });
  f.session.update(f.description, 1, false);
  await f.prepare();
  f.hooks.sampleTime();
  expect(read).toHaveBeenCalledOnce();
  const signal = read.mock.calls[0]![1];
  f.session.update(
    {
      ...f.description,
      dimensions: { ...f.description.dimensions, backing: { width: 120, height: 60 } },
    },
    2,
    false
  );
  expect(signal.aborted).toBe(true);
  expect(incoming.dispose).toHaveBeenCalledOnce();
  expect(f.provider.dispose).not.toHaveBeenCalled();
  const release = vi.fn();
  resolve({ ...f.lease, release });
  await vi.waitFor(() => expect(release).toHaveBeenCalledOnce());
});

it('preserves three admitted frames without superseding a queued read on the same decoder', async () => {
  const f = sourceSession();
  const prepared = await f.prepare();
  let finish!: (lease: PreviewSourceLease) => void;
  f.acquire.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const time = f.hooks.sampleTime();
  const captures = Array.from({ length: 3 }, () => f.hooks.capture(prepared.value, time, f.signal));
  await vi.waitFor(() => expect(f.acquire).toHaveBeenCalledTimes(2));
  finish(f.lease);
  const frames = await Promise.all(captures);
  expect(f.acquire).toHaveBeenCalledTimes(4);
  for (const frame of frames) frame.release();
});

it('keeps decoded playback live through native correction and cancels on a transport seek', async () => {
  const f = sourceSession();
  let epoch = 2;
  Object.defineProperty(f.video, 'paused', { configurable: true, value: false });
  f.input.readPosition = () => ({
    epoch,
    mapRevision: 3,
    resultTime: 1,
    source: { kind: 'video', sourceTime: 1.25, mediaTime: 1.25, segmentId: 'video:0' },
    media: { sourceId: f.input.sourceIdentity, time: 1.25 },
  });
  f.session.update(f.description, 1, false);
  await f.prepare();
  f.hooks.sampleTime();
  const invalidate = io.scheduler.mock.results[0]!.value.invalidate;
  vi.mocked(invalidate).mockClear();
  f.video.dispatchEvent(new Event('seeking'));
  expect(invalidate).not.toHaveBeenCalled();
  epoch++;
  f.video.dispatchEvent(new Event('seeking'));
  expect(invalidate).toHaveBeenCalledOnce();
});

it.each([false, true])(
  'captures the atomic decoded target while main native seek is pending (initial seek: %s)',
  async (initiallySeeking) => {
    const f = sourceSession();
    Object.defineProperty(f.video, 'readyState', { configurable: true, value: 1 });
    Object.defineProperty(f.video, 'seeking', { configurable: true, value: initiallySeeking });
    f.video.currentTime = 99;
    f.input.readPosition = () => ({
      epoch: 2,
      mapRevision: 3,
      resultTime: 6.25,
      source: { kind: 'freeze', sourceTime: 4, mediaTime: 3.98, segmentId: 'hold' },
      media: { sourceId: f.input.sourceIdentity, time: 99 },
    });
    Object.assign(f.binding, { timestamp: 3.96, nextTimestamp: 4, target: 3.98 });
    const prepared = await f.prepare();
    Object.defineProperty(f.video, 'readyState', { configurable: true, value: 0 });
    expect(() => f.hooks.capture(prepared.value, f.hooks.sampleTime(), f.signal)).toThrow();
    Object.defineProperty(f.video, 'readyState', { configurable: true, value: 1 });
    Object.defineProperty(f.video, 'seeking', { configurable: true, value: true });
    await f.hooks.capture(prepared.value, f.hooks.sampleTime(), f.signal);
    expect(f.acquire).toHaveBeenCalledTimes(2);
    for (const call of f.acquire.mock.calls)
      expect(call[0]).toEqual([
        expect.objectContaining({ url: f.input.sourceIdentity, time: 3.98 }),
      ]);
    expect(io.decoded).toHaveBeenCalledOnce();
    expect(io.decoded.mock.lastCall?.[0].time).toBe(6.25);
    expect(io.decoded.mock.lastCall?.[0].binding.target).toBe(3.98);
    expect(io.decoded.mock.lastCall?.[0].binding.timestamp).toBe(3.96);
    expect(io.legacy).not.toHaveBeenCalled();
  }
);

it('retries an initially empty source when metadata arrives and removes that listener on disposal', async () => {
  const f = sourceSession();
  Object.defineProperty(f.video, 'readyState', { configurable: true, value: 0 });
  await f.prepare().catch((error: unknown) => f.hooks.onError(error));
  expect(f.acquire).not.toHaveBeenCalled();
  const invalidate = io.scheduler.mock.results[0]!.value.invalidate;
  vi.mocked(invalidate).mockClear();
  Object.defineProperty(f.video, 'readyState', { configurable: true, value: 1 });
  f.video.dispatchEvent(new Event('loadedmetadata'));
  expect(invalidate).toHaveBeenCalledOnce();
  const prepared = await f.prepare();
  await f.hooks.capture(prepared.value, f.hooks.sampleTime(), f.signal);
  expect(io.decoded).toHaveBeenCalledOnce();
  const remove = vi.spyOn(f.video, 'removeEventListener');
  f.session.dispose();
  expect(remove).toHaveBeenCalledWith('loadedmetadata', expect.any(Function));
});

it('requires a native current frame for preparation and direct HTML capture without source decoding', async () => {
  const f = sourceSession();
  vi.stubGlobal('VideoDecoder', undefined);
  Object.defineProperty(f.video, 'readyState', { configurable: true, value: 1 });
  await expect(f.prepare()).rejects.toThrow();
  expect(io.legacy).not.toHaveBeenCalled();
  Object.defineProperty(f.video, 'readyState', { configurable: true, value: 2 });
  Object.defineProperty(f.video, 'seeking', { configurable: true, value: true });
  await expect(f.prepare()).rejects.toThrow();
  Object.defineProperty(f.video, 'seeking', { configurable: true, value: false });
  const prepared = await f.prepare();
  Object.defineProperty(f.video, 'readyState', { configurable: true, value: 1 });
  expect(() => f.hooks.capture(prepared.value, f.hooks.sampleTime(), f.signal)).toThrow();
  expect(io.legacy).not.toHaveBeenCalled();
  Object.defineProperty(f.video, 'readyState', { configurable: true, value: 2 });
  Object.defineProperty(f.video, 'seeking', { configurable: true, value: true });
  expect(() => f.hooks.capture(prepared.value, f.hooks.sampleTime(), f.signal)).toThrow();
  expect(io.legacy).not.toHaveBeenCalled();
  Object.defineProperty(f.video, 'seeking', { configurable: true, value: false });
  f.hooks.capture(prepared.value, f.hooks.sampleTime(), f.signal);
  expect(io.legacy).toHaveBeenCalledOnce();
  expect(f.acquire).not.toHaveBeenCalled();
});

it('uses the independent HTML provider at metadata when precise decoding is unsupported', async () => {
  const f = sourceSession();
  Object.defineProperty(f.video, 'readyState', { configurable: true, value: 1 });
  Object.defineProperty(f.video, 'seeking', { configurable: true, value: true });
  f.acquire.mockResolvedValue(null);
  const prepared = await f.prepare();
  await f.hooks.capture(prepared.value, f.hooks.sampleTime(), f.signal);
  expect(f.htmlAcquire).toHaveBeenCalledTimes(2);
  expect(io.decoded).toHaveBeenCalledOnce();
  expect(io.legacy).not.toHaveBeenCalled();
});

it.each([true, false])(
  'publishes decoded boundary capability only when independent decoding is supported (%s)',
  async (supported) => {
    const f = sourceSession();
    if (!supported) f.acquire.mockResolvedValue(null);
    const prepared = await f.prepare();
    const captured = await f.hooks.capture(prepared.value, f.hooks.sampleTime(), f.signal);
    const canvas = document.createElement('canvas');
    f.hooks.publish(
      {
        completed: { canvas, renderer: { backend: 'gpu' }, release: vi.fn() },
        prepared: prepared.value,
        retain: vi.fn(),
      },
      { scene: f.description, generation: '1', quality: 'selected', time: 1 }
    );
    expect(canvas.dataset['previewFront']).toBe('true');
    expect(f.report.mock.lastCall?.[0].renderer).toEqual({
      backend: 'gpu',
      ...(supported ? { decodedSourceIdentity: f.input.sourceIdentity } : {}),
    });
    expect(f.htmlAcquire).toHaveBeenCalledTimes(supported ? 0 : 2);
    captured.release();
  }
);

it('freezes the source/result clock pair before decoded acquisition and reuses the session provider', async () => {
  const f = sourceSession();
  const prepared = await f.prepare();
  const time = f.hooks.sampleTime();
  f.video.currentTime = 1.8;
  await f.hooks.capture(prepared.value, time, f.signal);
  expect(f.acquire.mock.calls[0]?.[0]).toEqual([
    expect.objectContaining({ url: 'blob:fixed-source', time: 1.25 }),
  ]);
  expect(io.decoded.mock.calls[0]?.[0]).toMatchObject({ binding: f.binding, time: 1 });
  expect(io.legacy).not.toHaveBeenCalled();
  f.video.currentTime = 1.25;
  await f.hooks.capture(prepared.value, f.hooks.sampleTime(), f.signal);
  expect(io.provider).toHaveBeenCalledOnce();
  f.session.dispose();
  expect(f.provider.dispose).toHaveBeenCalledOnce();
});

it('releases an aborted acquisition before a decoded capture can borrow it', async () => {
  const f = sourceSession();
  const prepared = await f.prepare();
  vi.mocked(f.lease.release).mockClear();
  const gate = Promise.withResolvers<PreviewSourceLease | null>();
  f.acquire.mockReturnValueOnce(gate.promise);
  const controller = new AbortController();
  const pending = Promise.resolve(
    f.hooks.capture(prepared.value, f.hooks.sampleTime(), controller.signal)
  );
  controller.abort();
  gate.resolve(f.lease);
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.lease.release).toHaveBeenCalledOnce();
  expect(io.decoded).not.toHaveBeenCalled();
});

it.each(['gpu', 'legacy'] as const)(
  'keeps %s decode failure on the precise route instead of recapturing HTML',
  async (renderer) => {
    const f = sourceSession();
    f.input.preferences = { ...f.input.preferences, renderer };
    f.description.renderer = renderer;
    const prepared = await f.prepare();
    const failure = new Error('Preview source frame is unavailable.');
    f.acquire.mockRejectedValueOnce(failure);
    await expect(f.hooks.capture(prepared.value, f.hooks.sampleTime(), f.signal)).rejects.toBe(
      failure
    );
    expect(io.legacy).not.toHaveBeenCalled();
    expect(f.htmlAcquire).not.toHaveBeenCalled();
  }
);

it('retires the precise owner on retry and reacquires across a Standard renderer change', async () => {
  const f = sourceSession();
  const prepared = await f.prepare();
  await f.hooks.capture(prepared.value, f.hooks.sampleTime(), f.signal);
  f.session.retry();
  expect(f.provider.dispose).toHaveBeenCalledOnce();
  f.input.preferences = { ...f.input.preferences, renderer: 'legacy' };
  f.description.renderer = 'legacy';
  const legacy = await f.prepare();
  const result = f.hooks.capture(legacy.value, f.hooks.sampleTime(), f.signal);
  expect(result).toBeInstanceOf(Promise);
  await result;
  expect(io.decoded).toHaveBeenCalledTimes(2);
  expect(io.legacy).not.toHaveBeenCalled();
  expect(io.provider).toHaveBeenCalledTimes(2);
});

it.each(['decoder-absent', 'frame-absent'] as const)(
  'preserves synchronous HTML recovery when source decoding is %s',
  async (reason) => {
    const f = sourceSession();
    vi.stubGlobal(reason === 'decoder-absent' ? 'VideoDecoder' : 'VideoFrame', undefined);
    const prepared = await f.prepare();
    const capture = f.hooks.capture(prepared.value, f.hooks.sampleTime(), f.signal);
    expect(capture).not.toBeInstanceOf(Promise);
    expect(io.legacy).toHaveBeenCalledOnce();
    expect(io.decoded).not.toHaveBeenCalled();
    expect(f.acquire).not.toHaveBeenCalled();
    expect(f.htmlAcquire).not.toHaveBeenCalled();
  }
);

it('keeps the physical provider across a seek and explicitly marks the next source discontinuity', async () => {
  const f = sourceSession();
  const prepared = await f.prepare();
  await f.hooks.capture(prepared.value, f.hooks.sampleTime(), f.signal);
  await f.hooks.capture(prepared.value, f.hooks.sampleTime(), f.signal);
  expect(f.acquire.mock.calls.at(-1)?.[2]).toEqual({ discontinuity: false });
  f.video.dispatchEvent(new Event('seeking'));
  f.video.dispatchEvent(new Event('seeked'));
  await f.hooks.capture(prepared.value, f.hooks.sampleTime(), f.signal);
  expect(f.acquire.mock.calls.at(-1)?.[2]).toEqual({ discontinuity: true });
  expect(io.provider).toHaveBeenCalledOnce();
});

it.each([false, true])(
  'preserves strict source acquisition at a fractional EOF (material overshoot: %s)',
  async (materialOvershoot) => {
    const actual = await vi.importActual<typeof import('../../workflows/video/preview-source')>(
      '../../workflows/video/preview-source'
    );
    const sourceEnd = 16.981333333333332;
    const nativeEnd = 16.981333;
    const opened = vi.fn();
    const f = sourceSession(() =>
      actual.createPreviewSourceProvider({
        open: async () => {
          opened();
          return {
            end: sourceEnd,
            timeResolution: 90000,
            async *samples(start) {
              const timestamps = [0, 16.966666666666665];
              const first = Math.max(
                0,
                timestamps.findLastIndex((value) => value <= start)
              );
              for (const timestamp of timestamps.slice(first))
                yield new VideoSample(new Uint8Array(16), {
                  format: 'RGBA',
                  codedWidth: 2,
                  codedHeight: 2,
                  timestamp,
                  duration: sourceEnd - timestamp,
                });
            },
            dispose: vi.fn(),
          };
        },
      })
    );
    Object.defineProperty(f.video, 'duration', { configurable: true, value: nativeEnd });
    f.video.currentTime = nativeEnd;
    f.input.playing = false;
    f.input.pausedSourceTime = f.description.sourceTime =
      sourceEnd + (materialOvershoot ? 0.001 : 0);
    f.input.pausedResultTime = 15.405671868409954;
    io.decoded.mockImplementation((args) => ({
      value: {
        ...f.captured.value,
        sourceTime: args.binding.target,
        resultTime: args.time,
        source: { ...f.captured.value.source, timestamp: args.binding.timestamp },
      },
      release: args.releaseSource,
    }));
    if (materialOvershoot) {
      await expect(f.prepare()).rejects.toThrow('Preview source frame is unavailable.');
      expect(opened).not.toHaveBeenCalled();
      expect(io.decoded).not.toHaveBeenCalled();
      return;
    }
    const prepared = await f.prepare();
    const terminal = await f.hooks.capture(prepared.value, f.input.pausedResultTime, f.signal);
    expect(io.decoded.mock.lastCall?.[0].binding).toMatchObject({
      target: nativeEnd,
      timestamp: 16.966666666666665,
      nextTimestamp: sourceEnd,
      heldAtEnd: true,
    });
    expect(terminal.value).toMatchObject({ resultTime: f.input.pausedResultTime });
    expect(f.description.sourceTime).toBe(sourceEnd);
    expect(f.video.currentTime).toBe(nativeEnd);
    terminal.release();
  }
);

it('releases a late initial probe after the presentation session is disposed', async () => {
  const f = sourceSession();
  const gate = Promise.withResolvers<PreviewSourceLease | null>();
  f.acquire.mockReturnValueOnce(gate.promise);
  const pending = f.prepare();
  f.session.dispose();
  gate.resolve(f.lease);
  await expect(pending).rejects.toBeInstanceOf(Error);
  expect(f.lease.release).toHaveBeenCalledOnce();
  expect(io.decoded).not.toHaveBeenCalled();
  expect(io.legacy).not.toHaveBeenCalled();
});

it.each(['cold', 'warm', 'retry'] as const)(
  'presents actual terminal PTS and resumes playback with the actual provider (%s)',
  async (mode) => {
    const actual = await vi.importActual<typeof import('../../workflows/video/preview-source')>(
      '../../workflows/video/preview-source'
    );
    const opened = vi.fn();
    const starts: number[] = [];
    const factory = () =>
      actual.createPreviewSourceProvider({
        open: async () => {
          opened();
          return {
            end: 8,
            async *samples(start) {
              starts.push(start);
              const timestamps = [0, 1, 2, 7.9];
              const first = Math.max(
                0,
                timestamps.findLastIndex((time) => time <= start)
              );
              for (const timestamp of timestamps.slice(first))
                yield new VideoSample(new Uint8Array(16), {
                  format: 'RGBA',
                  codedWidth: 2,
                  codedHeight: 2,
                  timestamp,
                  duration: 0.001,
                });
            },
            dispose: vi.fn(),
          };
        },
      });
    const f = sourceSession(factory);
    Object.defineProperty(f.video, 'duration', { configurable: true, value: 8 });
    io.decoded.mockImplementation((args) => ({
      value: {
        generation: args.sequence,
        fps: 60,
        sourceTime: args.binding.target,
        resultTime: args.time,
        source: {
          timestamp: args.binding.timestamp,
          backing: { width: 2, height: 2 },
          draw: args.binding.source.draw,
        },
      },
      release: args.releaseSource,
    }));
    if (mode !== 'cold') {
      const initial = await f.prepare();
      const frame = await f.hooks.capture(initial.value, f.hooks.sampleTime(), f.signal);
      frame.release();
    }
    if (mode === 'retry') f.session.retry();
    f.input.playing = false;
    f.input.pausedSourceTime = f.description.sourceTime = 8;
    f.input.pausedResultTime = 7.75;
    f.video.currentTime = 8;
    const prepared = await f.prepare();
    const terminal = await f.hooks.capture(prepared.value, 7.75, f.signal);
    expect(terminal.value).toMatchObject({
      sourceTime: 8,
      resultTime: 7.75,
      source: { timestamp: 7.9 },
    });
    expect(io.decoded.mock.lastCall?.[0].binding).toMatchObject({
      heldAtEnd: true,
      target: 8,
      timestamp: 7.9,
      nextTimestamp: 8,
    });
    terminal.release();
    expect(starts.at(-1)).toBeLessThan(8);
    expect(starts.at(-1)).toBeGreaterThan(7.9);
    f.input.playing = true;
    f.video.currentTime = 1.25;
    f.video.dispatchEvent(new Event('seeking'));
    f.video.dispatchEvent(new Event('seeked'));
    const replay = await f.hooks.capture(prepared.value, f.hooks.sampleTime(), f.signal);
    expect(replay.value).toMatchObject({
      sourceTime: 1.25,
      resultTime: 1,
      source: { timestamp: 1 },
    });
    expect(Reflect.get(io.decoded.mock.lastCall?.[0].binding ?? {}, 'heldAtEnd')).toBeUndefined();
    replay.release();
    expect(opened).toHaveBeenCalledTimes(mode === 'retry' ? 2 : 1);
    expect(io.legacy).not.toHaveBeenCalled();
  }
);

it.each(['gpu', 'legacy'] as const)(
  'keeps canonical %s source selection without WebGPU and freezes both clocks',
  async (renderer) => {
    const f = sourceSession();
    f.input.preferences = { ...f.input.preferences, renderer };
    f.description.renderer = renderer;
    vi.stubGlobal('navigator', { userAgent: 'test' });
    const prepared = await f.prepare();
    expect(f.acquire).toHaveBeenCalledOnce();
    const sampledResultTime = f.hooks.sampleTime();
    f.video.currentTime = 99;
    await f.hooks.capture(prepared.value, sampledResultTime, f.signal);
    expect(f.acquire.mock.lastCall?.[0]).toEqual([
      expect.objectContaining({ url: f.input.sourceIdentity, time: 1.25 }),
    ]);
    expect(io.decoded.mock.lastCall?.[0]).toMatchObject({ binding: f.binding, time: 1 });
    expect(io.legacy).not.toHaveBeenCalled();
  }
);

it('keeps primary decoding strict and independent of pending camera acquisition', async () => {
  const settings = createQuickEditWebcam(
    'camera',
    { width: 2, height: 2 },
    { width: 200, height: 100 }
  );
  const camera = {
    allocationBytes: 16,
    representedMediaTime: 0.4,
    generation: 1,
    source: { width: 2, height: 2 },
    placement: settings.placement,
    drawable: { draw: vi.fn() },
    release: vi.fn(),
  };
  const captureFrame = vi
    .fn<ReturnType<typeof cameraSources.createReviewWebcamPreviewSource>['captureFrame']>()
    .mockResolvedValue({ status: 'unavailable' });
  const cameraFactory = vi.spyOn(cameraSources, 'createReviewWebcamPreviewSource').mockReturnValue({
    canOverlapCapture: false,
    captureFrame,
    captureAccepted: vi.fn(),
    subscribeAdmission: () => () => {},
    dispose: vi.fn(),
  });
  const f = sourceSession(undefined, {
    settings,
    disabled: false,
    editor: {
      selection: { kind: 'webcam' },
      placement: settings.placement,
      crop: { zoom: 1, panX: 0, panY: 0 },
      resourceAttempt: 0,
      place: vi.fn(),
      retry: vi.fn(),
      selectVisible: vi.fn(),
      time: 1.25,
      sourceTime: 1.25,
    },
  });
  cameraFactory.mock.lastCall![3].loaded(10);
  f.description.scene = {
    ...f.description.scene,
    webcam: settings,
    captions: { document: { version: 1, fragments: [] }, settings: undefined, segments: [] },
  };
  expect(f.hooks.maximumInFlight?.(f.description)).toBe(1);
  const prepared = await f.prepare();
  const captions = io.prepareRenderer.mock.lastCall?.[0];
  expect(captions?.webcamDuration).toBe(10);
  (await f.prepare()).release();
  expect(io.prepareRenderer.mock.lastCall?.[0]).toBe(captions);

  await expect(f.hooks.capture(prepared.value, 1, f.signal)).rejects.toThrow();
  expect(io.provider).toHaveBeenCalledOnce();
  expect(io.legacy).not.toHaveBeenCalled();
  expect(io.decoded).not.toHaveBeenCalled();
  captureFrame.mockResolvedValue({ status: 'ready', frame: camera });
  f.acquire.mockRejectedValueOnce(new Error('primary decode failed'));
  await expect(f.hooks.capture(prepared.value, 1, f.signal)).rejects.toThrow(
    'primary decode failed'
  );
  expect(camera.release).toHaveBeenCalledOnce();
  expect(io.legacy).not.toHaveBeenCalled();
  expect(io.provider).toHaveBeenCalledOnce();
  cameraFactory.mock.lastCall![3].loaded(11);
  (await f.prepare()).release();
  expect(io.prepareRenderer.mock.lastCall?.[0]).not.toBe(captions);
  expect(io.prepareRenderer.mock.lastCall?.[0].webcamDuration).toBe(11);
});

it.each(['gpu', 'legacy'] as const)(
  'prepares verified HTML binding after upfront configuration decline for %s',
  async (renderer) => {
    const f = sourceSession();
    f.acquire.mockResolvedValueOnce(null);
    f.input.preferences = { ...f.input.preferences, renderer };
    f.description.renderer = renderer;
    const prepared = await f.prepare();
    expect(f.htmlAcquire).toHaveBeenCalledOnce();
    expect(f.htmlLease.release).toHaveBeenCalledOnce();
    vi.mocked(f.htmlLease.release).mockClear();
    const sampled = f.hooks.sampleTime();
    f.video.currentTime = 99;
    await f.hooks.capture(prepared.value, sampled, f.signal);
    expect(f.htmlAcquire.mock.lastCall?.[0]).toEqual([
      expect.objectContaining({
        id: 'source',
        url: f.input.sourceIdentity,
        time: 1.25,
        rangeStart: 0,
      }),
    ]);
    expect(io.decoded.mock.lastCall?.[0]).toMatchObject({ binding: f.htmlBinding, time: 1 });
    expect(io.decoded.mock.lastCall?.[0].binding).not.toHaveProperty('nextTimestamp');
    expect(io.legacy).not.toHaveBeenCalled();
    expect(f.acquire).toHaveBeenCalledOnce();
  }
);

it('does not replace a genuine initial canonical failure with HTML compatibility', async () => {
  const f = sourceSession();
  const failure = new Error('canonical decode failed');
  f.acquire.mockRejectedValueOnce(failure);
  await expect(f.prepare()).rejects.toBe(failure);
  expect(f.htmlAcquire).not.toHaveBeenCalled();
  expect(io.htmlProvider).not.toHaveBeenCalled();
  expect(io.legacy).not.toHaveBeenCalled();
});
it.each(['prepare', 'capture'] as const)(
  'keeps a real verified HTML %s failure managed and resets on retry',
  async (phase) => {
    const f = sourceSession();
    f.acquire.mockResolvedValueOnce(null);
    const failure = new Error('verified source failed');
    if (phase === 'prepare') {
      f.htmlAcquire.mockRejectedValueOnce(failure);
      await expect(f.prepare()).rejects.toBe(failure);
    } else {
      const prepared = await f.prepare();
      f.htmlAcquire.mockRejectedValueOnce(failure);
      await expect(f.hooks.capture(prepared.value, f.hooks.sampleTime(), f.signal)).rejects.toBe(
        failure
      );
    }
    expect(io.legacy).not.toHaveBeenCalled();
    expect(io.decoded).not.toHaveBeenCalled();
    f.session.retry();
    expect(f.htmlProvider.dispose).toHaveBeenCalledOnce();
    await f.prepare();
    expect(f.acquire).toHaveBeenCalledTimes(2);
    expect(io.legacy).not.toHaveBeenCalled();
  }
);
it.each(['abort', 'dispose', 'retry'] as const)(
  'releases a late compatible probe after %s without capturing raw',
  async (kind) => {
    const f = sourceSession();
    f.acquire.mockResolvedValueOnce(null);
    const gate = Promise.withResolvers<typeof f.htmlLease>();
    f.htmlAcquire.mockReturnValueOnce(gate.promise);
    const controller = new AbortController();
    const pending = f.hooks.prepare(
      { scene: f.description, generation: '1', quality: 'selected', time: 1 },
      controller.signal
    );
    await vi.waitFor(() => expect(f.htmlAcquire).toHaveBeenCalledOnce());
    if (kind === 'abort') controller.abort();
    if (kind === 'dispose') f.session.dispose();
    if (kind === 'retry') f.session.retry();
    gate.resolve(f.htmlLease);
    await expect(pending).rejects.toBeInstanceOf(Error);
    expect(f.htmlLease.release).toHaveBeenCalledOnce();
    expect(io.decoded).not.toHaveBeenCalled();
    expect(io.legacy).not.toHaveBeenCalled();
  }
);
it.each(['abort', 'dispose', 'retry'] as const)(
  'releases a late compatible frame after %s before a renderer borrows it',
  async (kind) => {
    const f = sourceSession();
    f.acquire.mockResolvedValueOnce(null);
    const prepared = await f.prepare();
    f.htmlLease.release.mockClear();
    const gate = Promise.withResolvers<typeof f.htmlLease>();
    f.htmlAcquire.mockReturnValueOnce(gate.promise);
    const controller = new AbortController();
    const pending = f.hooks.capture(prepared.value, f.hooks.sampleTime(), controller.signal);
    if (kind === 'abort') controller.abort();
    if (kind === 'dispose') f.session.dispose();
    if (kind === 'retry') f.session.retry();
    gate.resolve(f.htmlLease);
    await expect(pending).rejects.toBeInstanceOf(Error);
    expect(f.htmlLease.release).toHaveBeenCalledOnce();
    expect(io.decoded).not.toHaveBeenCalled();
    expect(io.legacy).not.toHaveBeenCalled();
  }
);
it('retains the compatible lease through frame release and resets it for Standard', async () => {
  const f = sourceSession();
  f.acquire.mockResolvedValue(null);
  const prepared = await f.prepare();
  f.htmlLease.release.mockClear();
  io.decoded.mockImplementationOnce((args) => ({
    value: {
      generation: 1,
      fps: 60,
      sourceTime: args.binding.target,
      resultTime: args.time,
      source: {
        timestamp: args.binding.timestamp,
        backing: { width: 2, height: 2 },
        draw: vi.fn(),
      },
    },
    release: args.releaseSource,
  }));
  const borrowed = await f.hooks.capture(prepared.value, f.hooks.sampleTime(), f.signal);
  expect(f.htmlLease.release).not.toHaveBeenCalled();
  f.session.retry();
  expect(f.htmlProvider.dispose).toHaveBeenCalledOnce();
  expect(f.htmlLease.release).not.toHaveBeenCalled();
  borrowed.release();
  expect(f.htmlLease.release).toHaveBeenCalledOnce();
  f.input.preferences = { ...f.input.preferences, renderer: 'legacy' };
  f.description.renderer = 'legacy';
  const legacy = await f.prepare();
  await f.hooks.capture(legacy.value, f.hooks.sampleTime(), f.signal);
  expect(io.htmlProvider).toHaveBeenCalledTimes(2);
  expect(io.legacy).not.toHaveBeenCalled();
});

it('keeps the admitted description and sequence while a compatible drag replaces the pending scene', async () => {
  const f = sourceSession();
  f.input.playing = false;
  const key = reviewPreviewSceneKey(f.description.scene, 'gesture-context');
  const first = { ...f.description, interactionKey: key };
  const second = { ...first, scene: { ...first.scene, comments: [] } };
  f.session.update(first, 1, true);
  const preparing = f.hooks.prepare(
    { scene: first, generation: '1', quality: 'selected', time: 1 },
    f.signal
  );
  f.session.update(second, 2, true);
  const prepared = await preparing;
  const captured = await f.hooks.capture(prepared.value, 1, f.signal);
  expect(io.decoded.mock.calls.at(-1)![0]).toMatchObject({ description: first, sequence: 1 });
  expect(io.decoded.mock.calls.at(-1)![0].description).toBe(first);
  captured.release();
  prepared.release();
});
