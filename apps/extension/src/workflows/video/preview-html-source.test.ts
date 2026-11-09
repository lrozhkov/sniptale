// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createPreviewHtmlSourceProvider } from './preview-html-source';

const metadata = vi.hoisted(() => ({
  floor: vi.fn(async (time: number) => ({ timestamp: time < 0.5 ? 0.1000006 : 0.6000006 })),
  dispose: vi.fn(),
  opening: vi.fn<() => Promise<void>>(async () => undefined),
  bytes: 512,
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
        getFirstTimestamp: async () => 0,
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
