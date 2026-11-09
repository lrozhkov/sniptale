// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createPreviewHtmlSourceProvider } from './preview-html-source';

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
function decoder(stale = false, pendingLoad = false) {
  const video = document.createElement('video');
  let currentTime = 0;
  Object.defineProperties(video, {
    readyState: { configurable: true, get: () => (pendingLoad ? 0 : 4) },
    seeking: { get: () => false },
    currentTime: {
      get: () => currentTime,
      set: (time: number) => {
        currentTime = time;
        queueMicrotask(() => video.dispatchEvent(new Event('seeked')));
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
        this.timestamp = stale
          ? 100000
          : Math.round((currentTime < 0.5 ? 0.1000006 : 0.6000006) * 1e6);
        frames.push(this);
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
  metadata.floor.mockClear();
  metadata.dispose.mockClear();
  metadata.opening.mockReset().mockResolvedValue(undefined);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
  await expect(
    provider.acquire([{ id: 'a', url: 'blob:test', time: 0.2 }], new AbortController().signal)
  ).rejects.toThrow('Preview source frame is unavailable.');
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
