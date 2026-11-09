import * as cameraSources from './webcam-preview';
import { createQuickEditWebcam } from '../../features/video/review/advanced/webcam';
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { VideoSample } from 'mediabunny';
import { createManualPresentationOwner } from './preview-presentation-session';
import type { PresentationInput, Description } from './preview-presentation-state';
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
    prepare: async () => ({
      generation: 1,
      watermarkBounds: null,
      allocationAssets: {
        headerBitmap: null,
        backgroundBitmap: null,
        watermark: null,
        previousWatermarkCache: null,
      },
      release: vi.fn(),
    }),
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
  const session = createManualPresentationOwner(
    () => ({
      input,
      cut: { plans: [], blend: null, read: () => null, retry: vi.fn(), current: null },
      placement: null,
    }),
    vi.fn(),
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
    },
  });
  cameraFactory.mock.lastCall![3].loaded(10);
  const prepared = await f.prepare();
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
