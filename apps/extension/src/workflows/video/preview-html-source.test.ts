// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createPreviewHtmlSourceProvider } from './preview-html-source';
import { EFFECT_RUNTIME_RESOURCE_LIMITS } from '../../features/video/composition/effect-runtime/runtime/resource-limits';

const metadata = vi.hoisted(() => ({
  floor: vi.fn(async (time: number) => ({ timestamp: time < 0.5 ? 0.1000006 : 0.6000006 })),
  dispose: vi.fn(),
  opening: vi.fn<() => Promise<void>>(async () => undefined),
  bytes: 512,
  resolution: 1000,
  first: 0,
  rate: 30,
}));
vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  UrlSource: class {},
  Input: class {
    dispose = metadata.dispose;
    async getPrimaryVideoTrack() {
      await metadata.opening();
      return {
        computeDuration: async () => 2,
        getFirstTimestamp: async () => metadata.first,
        computePacketStats: async () => ({ averagePacketRate: metadata.rate }),
        getTimeResolution: async () => metadata.resolution,
        getDecoderConfig: async () => ({ codec: 'avc1' }),
      };
    }
  },
  EncodedPacketSink: class {
    getPacket = metadata.floor;
  },
  VideoSample: class {
    displayWidth = 16;
    displayHeight = 8;
    constructor(readonly frame: { close(): void; clone(): unknown }) {}
    toVideoFrame() {
      return this.frame.clone();
    }
    draw = vi.fn();
    close() {
      this.frame.close();
    }
  },
}));
const frames: { timestamp: number; close: ReturnType<typeof vi.fn> }[] = [];
function decoder(
  stale = false,
  pendingLoad = false,
  notReadyOnSeek = false,
  presentation?: {
    timestamp: number;
    staleSnapshots?: number;
    captured?(): void;
    beforeSeeked?(): void;
  }
) {
  const video = document.createElement('video');
  let currentTime = 0;
  Object.defineProperties(video, {
    readyState: { configurable: true, get: () => (pendingLoad ? 0 : 4) },
    seeking: { get: () => false },
    currentTime: {
      get: () => currentTime,
      set: (time: number) => {
        currentTime = time;
        queueMicrotask(() => {
          if (notReadyOnSeek)
            Object.defineProperty(video, 'readyState', { configurable: true, value: 1 });
          presentation?.beforeSeeked?.();
          video.dispatchEvent(new Event('seeked'));
        });
      },
    },
    load: { value: vi.fn() },
    pause: { value: vi.fn() },
  });
  const original = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag, options) =>
    tag === 'video' ? video : original(tag, options)
  );
  vi.stubGlobal(
    'VideoFrame',
    class {
      timestamp: number;
      format = 'RGBA';
      colorSpace = {};
      close = vi.fn();
      constructor() {
        this.timestamp =
          presentation?.timestamp ??
          (stale ? 100000 : Math.round((currentTime < 0.5 ? 0.1000006 : 0.6000006) * 1e6));
        if (presentation?.staleSnapshots) {
          this.timestamp = 0;
          presentation.staleSnapshots--;
        }
        frames.push(this);
        presentation?.captured?.();
      }
      allocationSize() {
        return metadata.bytes;
      }
      clone() {
        return { close: vi.fn(), timestamp: this.timestamp };
      }
    }
  );
  return video;
}
afterEach(() => {
  metadata.bytes = 512;
  metadata.resolution = 1000;
  metadata.first = 0;
  metadata.rate = 30;
  frames.length = 0;
  metadata.floor.mockReset().mockImplementation(async (time: number) => ({
    timestamp: time < 0.5 ? 0.1000006 : 0.6000006,
  }));
  metadata.dispose.mockClear();
  metadata.opening.mockReset().mockResolvedValue(undefined);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('snapshots distinct pass packets with native rounded PTS and no invented coverage', async () => {
  const video = decoder();
  const provider = createPreviewHtmlSourceProvider();
  const lease = await provider.acquire(
    [
      { id: 'nominal', url: 'blob:test', time: 0.2 },
      { id: 'exposure', url: 'blob:test', time: 0.7 },
    ],
    new AbortController().signal
  );
  expect([...lease.bindings.values()].map((binding) => binding.timestamp)).toEqual([
    0.1000006, 0.6000006,
  ]);
  expect(lease.bindings.get('nominal')).toMatchObject({ membership: 'packet-floor', target: 0.2 });
  expect(lease.bindings.get('nominal')).not.toHaveProperty('nextTimestamp');
  expect(lease.bindings.get('nominal')!.source).not.toBe(lease.bindings.get('exposure')!.source);
  expect(video.muted).toBe(true);
  provider.dispose();
  expect(frames.every((frame) => frame.close.mock.calls.length === 0)).toBe(true);
  lease.release();
  lease.release();
  expect(frames.every((frame) => frame.close.mock.calls.length === 1)).toBe(true);
  expect(metadata.dispose).toHaveBeenCalledOnce();
});
it('rejects a stale native frame instead of manufacturing membership', async () => {
  decoder(true);
  const provider = createPreviewHtmlSourceProvider();
  const failed = provider.acquire(
    [{ id: 'a', url: 'blob:test', time: 0.2 }],
    new AbortController().signal
  );
  await expect(failed).rejects.toThrow('Preview source frame is unavailable.');
  await expect(failed).rejects.toMatchObject({
    cause: {
      reason: 'native-frame-timestamp-mismatch',
      expectedMicroseconds: 100001,
      actualMicroseconds: 100000,
      packetTimeSeconds: 0.1000006,
      targetSeconds: 0.2,
    },
  });
  expect(frames.every((frame) => frame.close.mock.calls.length === 1)).toBe(true);
  provider.dispose();
});

it.each(['metadata', 'load'] as const)(
  'aborts a blocked %s and permits a subsequent request',
  async (phase) => {
    const video = decoder(false, phase === 'load');
    const gate = Promise.withResolvers<void>();
    const entered = Promise.withResolvers<void>();
    if (phase === 'metadata')
      metadata.opening.mockImplementationOnce(() => {
        entered.resolve();
        return gate.promise;
      });
    else
      metadata.floor.mockImplementationOnce(async () => {
        entered.resolve();
        return { timestamp: 0.1000006 };
      });
    const provider = createPreviewHtmlSourceProvider();
    const controller = new AbortController();
    const pending = provider.acquire([{ id: 'a', url: 'blob:test', time: 0.2 }], controller.signal);
    await entered.promise;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(metadata.dispose).toHaveBeenCalledOnce();
    // A fresh source must complete without the canceled decoder's metadata or load event.
    Object.defineProperty(video, 'readyState', { configurable: true, get: () => 4 });
    const lease = await provider.acquire(
      [{ id: 'b', url: 'blob:replacement', time: 0.7 }],
      new AbortController().signal
    );
    expect(lease.bindings.get('b')!.timestamp).toBe(0.6000006);
    lease.release();
    provider.dispose();
    gate.resolve();
  }
);
it('closes earlier pass snapshots after a later pass metadata failure and permits retry', async () => {
  decoder();
  metadata.floor
    .mockResolvedValueOnce({ timestamp: 0.1000006 })
    .mockRejectedValueOnce(new Error('read failed'));
  const provider = createPreviewHtmlSourceProvider();
  await expect(
    provider.acquire(
      [
        { id: 'a', url: 'blob:test', time: 0.2 },
        { id: 'b', url: 'blob:test', time: 0.7 },
      ],
      new AbortController().signal
    )
  ).rejects.toThrow('read failed');
  expect(frames[0]!.close).toHaveBeenCalledOnce();
  const lease = await provider.acquire(
    [{ id: 'c', url: 'blob:test', time: 0.7 }],
    new AbortController().signal
  );
  lease.release();
  provider.dispose();
  expect(frames.every((frame) => frame.close.mock.calls.length === 1)).toBe(true);
});

it('reserves normalization scratch temporarily and restores exact lease storage after release', async () => {
  decoder();
  const provider = createPreviewHtmlSourceProvider();
  metadata.bytes = 32 * 1024 * 1024;
  const first = await provider.acquire(
    [{ id: 'a', url: 'blob:test', time: 0.2 }],
    new AbortController().signal
  );
  // 32 MiB retained + 96 MiB transient fits; keeping all scratch would reject this pass.
  const second = await provider.acquire(
    [{ id: 'b', url: 'blob:test', time: 0.7 }],
    new AbortController().signal
  );
  first.release();
  second.release();
  const third = await provider.acquire(
    [{ id: 'c', url: 'blob:test', time: 0.7 }],
    new AbortController().signal
  );
  third.release();
  provider.dispose();
  expect(frames.every((frame) => frame.close.mock.calls.length === 1)).toBe(true);
});

it.each([
  { time: 0.5, rangeEnd: 0.5, endpoint: 'retained-end' as const },
  { time: 2, rangeEnd: 2, holdEnd: true },
  { time: 12, holdSourceEnd: true as const },
])(
  'verifies terminal HTML packet identity without seeking excluded endpoint: %j',
  async (request) => {
    const video = decoder();
    const provider = createPreviewHtmlSourceProvider();
    const lease = await provider.acquire(
      [{ id: 'terminal', url: 'blob:test', ...request }],
      new AbortController().signal
    );
    const selected = lease.bindings.get('terminal')!;
    expect(selected).toMatchObject({
      timestamp: request.time === 0.5 ? 0.1000006 : 0.6000006,
      target: request.time,
    });
    expect(selected).toHaveProperty(request.time === 0.5 ? 'heldAtRetainedEnd' : 'heldAtEnd', true);
    expect(selected).not.toHaveProperty('nextTimestamp');
    if (request.time !== 0.5) expect(selected).toHaveProperty('heldSourceEnd', 2);
    else expect(selected).not.toHaveProperty('heldSourceEnd');
    expect(video.currentTime).toBe(selected.timestamp);
    expect(metadata.floor).toHaveBeenLastCalledWith(request.time === 0.5 ? 0.499 : 1.999, {
      metadataOnly: true,
    });
    provider.dispose();
    expect(frames[0]!.close).not.toHaveBeenCalled();
    lease.release();
    expect(frames[0]!.close).toHaveBeenCalledOnce();
  }
);

it('keeps verified bounded leading admission separate from held endpoint flags', async () => {
  decoder();
  metadata.first = 0.1000006;
  metadata.rate = 1;
  const provider = createPreviewHtmlSourceProvider();
  const lease = await provider.acquire(
    [{ id: 'leading', url: 'blob:test', time: 0, rangeEnd: 0.5 }],
    new AbortController().signal
  );
  expect(lease.bindings.get('leading')).toMatchObject({
    target: 0,
    sampleTime: 0.1000006,
    timestamp: 0.1000006,
  });
  expect(lease.bindings.get('leading')).not.toHaveProperty('heldAtEnd');
  expect(lease.bindings.get('leading')).not.toHaveProperty('heldAtRetainedEnd');
  lease.release();
  provider.dispose();
});
it('rejects a floor response at the excluded endpoint and a predecessor outside the retained start', async () => {
  decoder();
  metadata.floor.mockResolvedValueOnce({ timestamp: 0.5 });
  const provider = createPreviewHtmlSourceProvider();
  const request = {
    id: 'held',
    url: 'blob:test',
    time: 0.5,
    rangeEnd: 0.5,
    endpoint: 'retained-end' as const,
  };
  await expect(provider.acquire([request], new AbortController().signal)).rejects.toThrow(
    'Preview source frame is unavailable.'
  );
  await expect(
    provider.acquire([{ ...request, rangeStart: 0.2 }], new AbortController().signal)
  ).rejects.toThrow('Preview source frame is unavailable.');
  expect(frames).toHaveLength(0);
  provider.dispose();
});
it.each([
  { time: 0.5, holdEnd: true },
  { time: 0.4, rangeEnd: 0.5, endpoint: 'retained-end' as const },
  { time: 0.5, rangeEnd: 1, holdSourceEnd: true as const },
  { time: -1 },
  { time: NaN },
])('rejects invalid common HTML source intent before opening: %j', async (request) => {
  decoder();
  const provider = createPreviewHtmlSourceProvider();
  await expect(
    provider.acquire(
      [{ id: 'invalid', url: 'blob:test', ...request }],
      new AbortController().signal
    )
  ).rejects.toThrow('Preview source frame is unavailable.');
  expect(metadata.opening).not.toHaveBeenCalled();
  provider.dispose();
});

it('keeps post-seek readiness refusal distinct from timestamp membership failure', async () => {
  decoder(false, false, true);
  const provider = createPreviewHtmlSourceProvider();
  await expect(
    provider.acquire([{ id: 'a', url: 'blob:test', time: 0.2 }], new AbortController().signal)
  ).rejects.toMatchObject({
    message: 'Preview source frame is unavailable.',
    cause: { reason: 'native-frame-not-ready', readyState: 1, seeking: false },
  });
  expect(frames).toHaveLength(0);
  expect(metadata.dispose).toHaveBeenCalledOnce();
  provider.dispose();
});

function presentedDecoder() {
  const captured = Promise.withResolvers<void>();
  const state = {
    timestamp: 0,
    staleSnapshots: 0,
    captured: () => captured.resolve(),
    beforeSeeked: () => {},
  };
  const video = decoder(false, false, false, state);
  metadata.floor.mockResolvedValue({ timestamp: 1.2 });
  let nextId = 0;
  const callbacks = new Map<number, VideoFrameRequestCallback>();
  const request = vi.fn((callback: VideoFrameRequestCallback) => {
    const id = ++nextId;
    callbacks.set(id, callback);
    return id;
  });
  const cancel = vi.fn((id: number) => {
    callbacks.delete(id);
  });
  Object.defineProperties(video, {
    requestVideoFrameCallback: { value: request },
    cancelVideoFrameCallback: { value: cancel },
  });
  const invoke = (callback: VideoFrameRequestCallback) =>
    callback(0, {
      mediaTime: state.timestamp / 1e6,
      presentationTime: 0,
      expectedDisplayTime: 0,
      width: 16,
      height: 8,
      presentedFrames: 1,
    });
  const present = (timestamp: number) => {
    state.timestamp = timestamp;
    const entry = callbacks.entries().next().value;
    if (!entry) throw new Error('Expected an armed presentation callback.');
    callbacks.delete(entry[0]);
    invoke(entry[1]);
  };
  return { video, state, captured: captured.promise, request, cancel, callbacks, present, invoke };
}
const presentedDemand = { id: 'presented', url: 'blob:private', time: 1.3124 };

it('waits for actual native presentation after seeked reports ready with a stale initial frame', async () => {
  const f = presentedDecoder();
  const provider = createPreviewHtmlSourceProvider();
  const pending = provider.acquire([presentedDemand], new AbortController().signal);
  void pending.catch(() => undefined);
  await f.captured;
  expect(f.video.currentTime).toBe(1.3124);
  expect(f.request).toHaveBeenCalledOnce();
  expect(frames[0]!.timestamp).toBe(0);
  expect(frames[0]!.close).toHaveBeenCalledOnce();
  f.present(1_200_000);
  const lease = await pending;
  expect(lease.bindings.get('presented')).toMatchObject({
    target: 1.3124,
    timestamp: 1.2,
    membership: 'packet-floor',
  });
  expect(frames[1]!.close).not.toHaveBeenCalled();
  expect(f.callbacks.size).toBe(0);
  lease.release();
  provider.dispose();
  expect(frames.every((frame) => frame.close.mock.calls.length === 1)).toBe(true);
});

it.each(['selected', 'stale'] as const)(
  'retains %s presentation evidence delivered before seeked',
  async (kind) => {
    const f = presentedDecoder();
    const provider = createPreviewHtmlSourceProvider();
    f.state.beforeSeeked = () => f.present(kind === 'selected' ? 1_200_000 : 0);
    const pending = provider.acquire([presentedDemand], new AbortController().signal);
    await f.captured;
    if (kind === 'stale') {
      expect(f.request).toHaveBeenCalledTimes(2);
      f.present(1_200_000);
    }
    const lease = await pending;
    expect(lease.bindings.get('presented')!.timestamp).toBe(1.2);
    expect(f.callbacks.size).toBe(0);
    expect(f.request).toHaveBeenCalledTimes(kind === 'selected' ? 1 : 2);
    lease.release();
    provider.dispose();
    expect(frames.every((frame) => frame.close.mock.calls.length === 1)).toBe(true);
  }
);
it('rejects persistently wrong presented PTS at the fixed deadline without resetting its budget', async () => {
  vi.useFakeTimers();
  const f = presentedDecoder();
  const provider = createPreviewHtmlSourceProvider();
  const pending = provider.acquire([presentedDemand], new AbortController().signal);
  const refused = expect(pending).rejects.toMatchObject({
    message: 'Preview source frame is unavailable.',
    cause: {
      reason: 'native-frame-timestamp-mismatch',
      expectedMicroseconds: 1_200_000,
      actualMicroseconds: 0,
      packetTimeSeconds: 1.2,
      targetSeconds: 1.3124,
    },
  });
  await f.captured;
  const third = EFFECT_RUNTIME_RESOURCE_LIMITS.mediaDecodeTimeoutMs / 3;
  for (let index = 0; index < 2; index++) {
    await vi.advanceTimersByTimeAsync(third);
    f.present(0);
    await vi.advanceTimersByTimeAsync(0);
  }
  expect(frames).toHaveLength(3);
  await vi.advanceTimersByTimeAsync(third);
  await refused;
  expect(f.callbacks.size).toBe(0);
  expect(f.cancel).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  expect(frames.every((frame) => frame.close.mock.calls.length === 1)).toBe(true);
  provider.dispose();
});
it.each(['abort', 'dispose', 'error'] as const)(
  'cleans a presentation wait after %s and ignores its late callback',
  async (reason) => {
    vi.useFakeTimers();
    const f = presentedDecoder();
    const provider = createPreviewHtmlSourceProvider();
    const controller = new AbortController();
    const pending = provider.acquire([presentedDemand], controller.signal);
    const rejected = expect(pending).rejects.toMatchObject(
      reason === 'error'
        ? { message: 'Preview source frame is unavailable.' }
        : { name: 'AbortError' }
    );
    await f.captured;
    const late = f.callbacks.values().next().value;
    if (!late) throw new Error('Expected pending presentation.');
    if (reason === 'abort') controller.abort();
    if (reason === 'dispose') provider.dispose();
    if (reason === 'error') f.video.dispatchEvent(new Event('error'));
    await rejected;
    await vi.advanceTimersByTimeAsync(0);
    expect(f.callbacks.size).toBe(0);
    expect(f.cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    f.state.timestamp = 1_200_000;
    f.invoke(late);
    await Promise.resolve();
    expect(frames).toHaveLength(1);
    expect(frames[0]!.close).toHaveBeenCalledOnce();
    provider.dispose();
  }
);

it('consumes early presentation evidence when the first post-seek native snapshot is still stale', async () => {
  const f = presentedDecoder();
  const provider = createPreviewHtmlSourceProvider();
  f.state.staleSnapshots = 1;
  f.state.beforeSeeked = () => f.present(1_200_000);
  const lease = await provider.acquire([presentedDemand], new AbortController().signal);
  expect(f.request).toHaveBeenCalledOnce();
  expect(frames.map((frame) => frame.timestamp)).toEqual([0, 1_200_000]);
  expect(frames[0]!.close).toHaveBeenCalledOnce();
  expect(frames[1]!.close).not.toHaveBeenCalled();
  expect(lease.bindings.get('presented')).toMatchObject({ timestamp: 1.2, target: 1.3124 });
  expect(f.callbacks.size).toBe(0);
  lease.release();
  provider.dispose();
  expect(frames[1]!.close).toHaveBeenCalledOnce();
});
