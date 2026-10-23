// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VideoSample } from 'mediabunny';
import {
  createReviewDecodedSampleSink,
  createCompositionCutSampleSource,
} from './decoded-video-sample';
import {
  createProject,
  createVideoClip,
} from '../../features/video/project/timeline/project-meta.test.helpers';

const cutDecode = vi.hoisted(() => ({
  getSample: vi.fn(),
  samples: vi.fn(),
  canDecode: vi.fn(),
  dispose: vi.fn(),
  open: vi.fn(),
}));
vi.mock('mediabunny', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mediabunny')>();
  return {
    ...actual,
    UrlSource: class {
      constructor(url: string) {
        cutDecode.open(url);
      }
    },
    Input: class {
      dispose = cutDecode.dispose;
      async getPrimaryVideoTrack() {
        return {
          canDecode: cutDecode.canDecode,
          getDecoderConfig: async () => ({ codec: 'vp09.00.10.08' }),
        };
      }
    },
    VideoSampleSink: class {
      getSample = cutDecode.getSample;
      samples = cutDecode.samples;
    },
  };
});

const frames: TestFrame[] = [];
let copy = vi.fn(async () => [
  { offset: 0, stride: 16 },
  { offset: 160, stride: 16 },
]);
class TestFrame {
  format: VideoPixelFormat;
  codedWidth: number;
  codedHeight: number;
  displayWidth: number;
  displayHeight: number;
  visibleRect: DOMRect;
  timestamp: number;
  duration: number;
  colorSpace: VideoColorSpaceInit = {
    primaries: 'bt709',
    transfer: 'bt709',
    matrix: 'bt709',
    fullRange: false,
  };
  close = vi.fn();
  allocationSize = () => 240;
  copyTo = () => copy();
  constructor(data: TestFrame | Uint8Array, init: VideoFrameBufferInit) {
    const source = data instanceof TestFrame ? data : null;
    this.format = source?.format ?? init.format;
    this.codedWidth = source?.codedWidth ?? init.codedWidth;
    this.codedHeight = source?.codedHeight ?? init.codedHeight;
    this.visibleRect =
      source?.visibleRect ??
      new DOMRect(
        init.visibleRect?.x ?? 0,
        init.visibleRect?.y ?? 0,
        init.visibleRect?.width ?? this.codedWidth,
        init.visibleRect?.height ?? this.codedHeight
      );
    this.displayWidth = source?.displayWidth ?? init.displayWidth ?? this.visibleRect.width;
    this.displayHeight = source?.displayHeight ?? init.displayHeight ?? this.visibleRect.height;
    this.timestamp = init.timestamp ?? source?.timestamp ?? 0;
    this.duration = init.duration ?? source?.duration ?? 0;
    if (init.colorSpace) this.colorSpace = { ...this.colorSpace, ...init.colorSpace };
    frames.push(this);
  }
}
beforeEach(() => {
  vi.clearAllMocks();
  cutDecode.canDecode.mockResolvedValue(true);
  cutDecode.getSample.mockReset();
  cutDecode.samples.mockReset();
  frames.length = 0;
  copy = vi.fn(async () => [
    { offset: 0, stride: 16 },
    { offset: 160, stride: 16 },
  ]);
  vi.stubGlobal('VideoFrame', TestFrame);
});
afterEach(() => vi.unstubAllGlobals());

function setup(format: VideoPixelFormat = 'NV12', height = 16, config?: VideoDecoderConfig) {
  const sample = new VideoSample(
    new VideoFrame(new Uint8Array(384), {
      format,
      codedWidth: 16,
      codedHeight: height,
      visibleRect: { x: 0, y: 0, width: 16, height: 10 },
      displayWidth: 32,
      displayHeight: 10,
      timestamp: 1_000_000,
      duration: 40_000,
    }),
    { rotation: 90 }
  );
  const controller = new AbortController();
  const sink = createReviewDecodedSampleSink(
    {
      getSample: async () => sample,
      async *samples() {
        yield sample;
      },
      async *samplesAtTimestamps() {
        yield sample;
      },
    },
    controller.signal,
    config
  );
  return { sample, controller, sink };
}

it.each(['getSample', 'samples', 'samplesAtTimestamps'] as const)(
  'packs visible NV12 planes for %s, preserving sample metadata',
  async (method) => {
    const { sink } = setup();
    const prepared =
      method === 'getSample'
        ? await sink.getSample(1)
        : method === 'samples'
          ? (await sink.samples(0, 2).next()).value
          : (await sink.samplesAtTimestamps([1]).next()).value;
    expect(prepared).toBeInstanceOf(VideoSample);
    if (!prepared) throw new Error('Missing sample');
    const frame = prepared.toVideoFrame();
    expect(frame.codedHeight).toBe(10);
    expect(frame.visibleRect?.height).toBe(10);
    expect(prepared.rotation).toBe(90);
    expect(prepared.displayWidth).toBe(10);
    expect(prepared.displayHeight).toBe(32);
    expect(prepared.timestamp).toBe(1);
    expect(prepared.duration).toBe(0.04);
    expect(prepared.colorSpace.matrix).toBe('bt709');
    expect(frames[0]!.close).toHaveBeenCalledOnce();
    frame.close();
    prepared.close();
    expect(frames.every((value) => value.close.mock.calls.length === 1)).toBe(true);
  }
);

it.each([
  ['I420', 16],
  ['NV12', 10],
] as const)('passes through %s height %i without a pixel copy', async (format, height) => {
  const { sample, sink } = setup(format, height);
  expect(await sink.getSample(1)).toBe(sample);
  expect(copy).not.toHaveBeenCalled();
  expect(frames[0]!.close).not.toHaveBeenCalled();
  sample.close();
});

it.each(['failure', 'abort'] as const)(
  'releases both decoded frame references on copy %s',
  async (mode) => {
    const { controller, sink } = setup();
    copy.mockImplementation(async () => {
      if (mode === 'failure') throw new Error('readback failed');
      controller.abort();
      return [];
    });
    await expect(sink.getSample(1)).rejects.toThrow(
      mode === 'failure' ? 'readback failed' : 'aborted'
    );
    expect(frames.every((frame) => frame.close.mock.calls.length === 1)).toBe(true);
  }
);

it('uses the VP8 default matrix without converting or retiming native planes', async () => {
  const { sink, sample } = setup('I420', 16, { codec: 'vp8' });
  const prepared = await sink.getSample(1);
  expect(prepared!.colorSpace.matrix).toBe('smpte170m');
  expect(prepared!.timestamp).toBe(sample.timestamp);
  expect(prepared!.duration).toBe(sample.duration);
  expect(prepared!.rotation).toBe(sample.rotation);
  expect(prepared!.format).toBe('I420');
  expect(copy).toHaveBeenCalledOnce();
  prepared!.close();
});

it('preserves an explicit VP8 matrix and other codec metadata without copying', async () => {
  for (const config of [
    { codec: 'vp8', colorSpace: { matrix: 'bt709' } },
    { codec: 'vp09.00.10.08' },
  ] as const) {
    const { sink, sample } = setup('I420', 16, config);
    expect(await sink.getSample(1)).toBe(sample);
    expect(copy).not.toHaveBeenCalled();
    sample.close();
  }
});

it('releases a sample acquired after cancellation without reading its pixels', async () => {
  const { controller, sink } = setup();
  controller.abort();
  await expect(sink.getSample(1)).rejects.toMatchObject({ name: 'AbortError' });
  expect(copy).not.toHaveBeenCalled();
  expect(frames).toHaveLength(1);
  expect(frames[0]!.close).toHaveBeenCalledOnce();
});

it('preserves missing frame results for the export owner to report', async () => {
  const sink = createReviewDecodedSampleSink(
    {
      getSample: async () => null,
      async *samples() {},
      async *samplesAtTimestamps() {
        yield null;
      },
    },
    new AbortController().signal
  );
  expect(await sink.getSample(1)).toBeNull();
  expect((await sink.samplesAtTimestamps([1]).next()).value).toBeNull();
  expect(copy).not.toHaveBeenCalled();
});

it.each(['getSample', 'samples', 'samplesAtTimestamps'] as const)(
  'classifies an actual %s decoder rejection and preserves its cause',
  async (method) => {
    const cause = new Error('private decoder details');
    const sink = createReviewDecodedSampleSink(
      {
        getSample: async () => {
          throw cause;
        },
        async *samples() {
          yield await Promise.reject(cause);
        },
        async *samplesAtTimestamps() {
          yield await Promise.reject(cause);
        },
      },
      new AbortController().signal
    );
    const operation =
      method === 'getSample'
        ? sink.getSample(1)
        : method === 'samples'
          ? sink.samples(0, 2).next()
          : sink.samplesAtTimestamps([1]).next();
    await expect(operation).rejects.toMatchObject({ stage: 'decode', cause });
  }
);

function cutFrame(timestamp: number) {
  return new VideoSample(
    new VideoFrame(new Uint8Array(16 * 16 * 4), {
      format: 'RGBA',
      codedWidth: 16,
      codedHeight: 16,
      timestamp: Math.round(timestamp * 1_000_000),
    }),
    { timestamp }
  );
}
function cutSource() {
  const clip = createVideoClip({
    id: 'cut-side',
    startTime: 0,
    duration: 0.1,
    sourceStart: 2.9,
    sourceDuration: 0.1,
  });
  const project = createProject([clip]);
  return createCompositionCutSampleSource({ project, sourceUrl: () => 'blob:accepted-cut-source' });
}

it('rejects decoded cut pixels and retains only frames inside the source range after clock rounding', async () => {
  const excluded = cutFrame(3),
    preceding = cutFrame(2.8),
    retained = cutFrame(2.95),
    end = cutFrame(3);
  const close = [excluded, preceding, retained, end].map((sample) => vi.spyOn(sample, 'close'));
  cutDecode.getSample.mockResolvedValue(excluded);
  cutDecode.samples.mockImplementation(async function* () {
    yield preceding;
    yield retained;
    yield end;
  });
  const source = cutSource();
  const lease = await source.sample(0.09999999999999999, new AbortController().signal, 'last');
  expect(cutDecode.getSample).toHaveBeenCalledWith(3);
  expect(lease.media.get('cut-side')).toMatchObject({ sourceWidth: 16, sourceHeight: 16 });
  expect(close.map((spy) => spy.mock.calls.length)).toEqual([1, 1, 0, 1]);
  lease.release();
  lease.release();
  expect(close.map((spy) => spy.mock.calls.length)).toEqual([1, 1, 1, 1]);
  source.dispose();
  source.dispose();
  expect(cutDecode.dispose).toHaveBeenCalledOnce();
});

it('refuses an empty retained range and permits a fresh sampling retry', async () => {
  const source = cutSource();
  const excluded = cutFrame(2.8);
  const close = vi.spyOn(excluded, 'close');
  cutDecode.getSample.mockResolvedValueOnce(excluded).mockResolvedValueOnce(cutFrame(2.95));
  cutDecode.samples.mockImplementation(async function* () {});
  await expect(source.sample(0.05, new AbortController().signal, 'first')).rejects.toThrow(
    'no retained video frame'
  );
  expect(close).toHaveBeenCalledOnce();
  const lease = await source.sample(0.05, new AbortController().signal, 'first');
  expect(lease.media.size).toBe(1);
  lease.release();
  source.dispose();
  expect(cutDecode.open).toHaveBeenCalledOnce();
});

it.each(['dispose', 'request'] as const)(
  'closes late frames after %s cancellation without publishing them',
  async (cancel) => {
    let finish: (sample: VideoSample) => void = () => {
      throw new Error('Sample was not requested');
    };
    const waiting = new Promise<VideoSample>((resolve) => {
      finish = resolve;
    });
    let started: () => void = () => {};
    const reading = new Promise<void>((resolve) => {
      started = resolve;
    });
    cutDecode.getSample.mockImplementation(() => {
      started();
      return waiting;
    });
    const source = cutSource();
    const request = new AbortController();
    const pending = source.sample(0.05, request.signal, 'first');
    await reading;
    if (cancel === 'dispose') source.dispose();
    else request.abort();
    expect(cutDecode.dispose).toHaveBeenCalledOnce();
    const late = cutFrame(2.95),
      close = vi.spyOn(late, 'close');
    finish(late);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(close).toHaveBeenCalledOnce();
    expect(cutDecode.dispose).toHaveBeenCalledOnce();
  }
);

it('does not require hidden cut media that the composition will not paint', async () => {
  const project = createProject([
    createVideoClip({ id: 'hidden', duration: 1, sourceDuration: 1 }),
  ]);
  project.tracks = project.tracks.map((track) => ({ ...track, visible: false }));
  const source = createCompositionCutSampleSource({ project, sourceUrl: () => undefined });
  const lease = await source.sample(0.5, new AbortController().signal, 'first');
  expect(lease.media.size).toBe(0);
  expect(cutDecode.open).not.toHaveBeenCalled();
  lease.release();
  source.dispose();
});

it('holds the last bounded video frame after a split even when the caller requests a first endpoint', async () => {
  const clip = createVideoClip({
    id: 'held',
    sourceStart: 2.9,
    sourceDuration: 0.1,
    startTime: 0,
    duration: 0.1,
    playbackWindow: { offset: 0.2, holdAt: 0.1 },
  });
  const first = cutFrame(2.91),
    last = cutFrame(2.95),
    excluded = cutFrame(3);
  const closeFirst = vi.spyOn(first, 'close'),
    closeLast = vi.spyOn(last, 'close');
  cutDecode.getSample.mockResolvedValue(excluded);
  cutDecode.samples.mockImplementation(async function* () {
    yield first;
    yield last;
  });
  const source = createCompositionCutSampleSource({
    project: createProject([clip]),
    sourceUrl: () => 'blob:held',
  });
  const lease = await source.sample(0.05, new AbortController().signal, 'first');
  expect(cutDecode.getSample).toHaveBeenCalledWith(3);
  expect(closeFirst).toHaveBeenCalledOnce();
  expect(closeLast).not.toHaveBeenCalled();
  lease.release();
  source.dispose();
  expect(closeLast).toHaveBeenCalledOnce();
});
