// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VideoSample } from 'mediabunny';
import { createReviewDecodedSampleSink } from './decoded-video-sample';

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
  colorSpace = { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false };
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
    frames.push(this);
  }
}
beforeEach(() => {
  frames.length = 0;
  copy = vi.fn(async () => [
    { offset: 0, stride: 16 },
    { offset: 160, stride: 16 },
  ]);
  vi.stubGlobal('VideoFrame', TestFrame);
});
afterEach(() => vi.unstubAllGlobals());

function setup(format: VideoPixelFormat = 'NV12', height = 16) {
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
    controller.signal
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
