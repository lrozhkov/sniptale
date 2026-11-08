// @vitest-environment jsdom

import { assert, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  addVideoTrack: vi.fn(),
  cancel: vi.fn(),
  finalize: vi.fn(),
  formatOptions: [] as unknown[],
  sourceOptions: [] as unknown[],
  sampleCreate: vi.fn(),
  samples: [] as {
    canvas: HTMLCanvasElement;
    options: { timestamp: number; duration: number };
    close: ReturnType<typeof vi.fn>;
  }[],
  start: vi.fn(),
}));

vi.mock('mediabunny', () => {
  class BufferTarget {
    buffer: ArrayBuffer | null = new Uint8Array([1, 2, 3]).buffer;
  }
  class VideoSampleSource {
    add = mocks.add;

    constructor(options: { onEncoderConfig(config: { codec: string }): void }) {
      mocks.sourceOptions.push(options);
      options.onEncoderConfig({ codec: 'avc1.640033' });
    }
  }
  class VideoSample {
    close = vi.fn();

    constructor(
      public canvas: HTMLCanvasElement,
      public options: { timestamp: number; duration: number }
    ) {
      mocks.sampleCreate();
      mocks.samples.push(this);
    }
  }
  class Mp4OutputFormat {
    constructor(options: unknown) {
      mocks.formatOptions.push(options);
    }
  }
  class Output {
    addVideoTrack = mocks.addVideoTrack;
    cancel = mocks.cancel;
    finalize = mocks.finalize;
    start = mocks.start;
  }
  return {
    BufferTarget,
    VideoSample,
    VideoSampleSource,
    Mp4OutputFormat,
    Output,
    QUALITY_MEDIUM: 1,
    canEncodeVideo: vi.fn(() => Promise.resolve(true)),
  };
});

import { encodePersistentVideoPreview } from './encode';

function createParams() {
  return {
    canvas: document.createElement('canvas'),
    endFrame: 1,
    fps: 4,
    onFrame: vi.fn(async () => {}),
    signal: new AbortController().signal,
    startFrame: 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.formatOptions.length = 0;
  mocks.sourceOptions.length = 0;
  mocks.samples.length = 0;
  mocks.sampleCreate.mockReset();
  mocks.add.mockResolvedValue(undefined);
  mocks.cancel.mockResolvedValue(undefined);
  mocks.start.mockResolvedValue(undefined);
  mocks.finalize.mockResolvedValue(undefined);
});

it('encodes fragmented AVC with relative samples and half-second keyframes using the fallback canvas', async () => {
  const params = { ...createParams(), startFrame: 7, endFrame: 10 };
  const result = await encodePersistentVideoPreview(params);

  expect(mocks.formatOptions).toEqual([{ fastStart: 'fragmented', minimumFragmentDuration: 0.5 }]);
  expect(mocks.sourceOptions).toEqual([
    expect.objectContaining({
      bitrate: 1,
      codec: 'avc',
      hardwareAcceleration: 'no-preference',
      latencyMode: 'realtime',
      keyFrameInterval: 0.5,
    }),
  ]);
  expect(mocks.samples.map((sample) => sample.options)).toEqual([
    { timestamp: 0, duration: 0.25 },
    { timestamp: 0.25, duration: 0.25 },
    { timestamp: 0.5, duration: 0.25 },
  ]);
  for (const [index, sample] of mocks.samples.entries()) {
    expect(sample.canvas).toBe(params.canvas);
    expect(mocks.add.mock.calls[index]?.[0]).toBe(sample);
    expect(sample.close).toHaveBeenCalledExactlyOnceWith();
  }
  expect(mocks.add.mock.calls.map((call) => call[1])).toEqual([
    { keyFrame: true },
    { keyFrame: false },
    { keyFrame: true },
  ]);
  expect(params.onFrame.mock.calls).toEqual([[7], [8], [9]]);
  expect(result.blob.type).toBe('video/mp4');
  expect(result.codec).toBe('avc1.640033');
});

it('encodes each returned canvas and holds its resource through encoder backpressure', async () => {
  const pending = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  const firstFrame = { canvas: document.createElement('canvas'), release: vi.fn() };
  const frames = [firstFrame, { canvas: document.createElement('canvas'), release: vi.fn() }];
  mocks.add.mockImplementationOnce(() => {
    entered.resolve();
    return pending.promise;
  });
  const onFrame = vi.fn(async (index: number) => frames[index]);
  const encoding = encodePersistentVideoPreview({ ...createParams(), endFrame: 2, onFrame });
  await entered.promise;

  expect(mocks.samples[0]?.canvas).toBe(firstFrame.canvas);
  expect(firstFrame.release).not.toHaveBeenCalled();
  expect(mocks.samples[0]?.close).not.toHaveBeenCalled();
  expect(onFrame).toHaveBeenCalledTimes(1);
  pending.resolve();
  await encoding;

  for (const [index, frame] of frames.entries()) {
    const sample = mocks.samples[index];
    assert.isDefined(sample);
    expect(sample.canvas).toBe(frame.canvas);
    expect(sample.close).toHaveBeenCalledExactlyOnceWith();
    expect(frame.release).toHaveBeenCalledExactlyOnceWith();
    const releaseOrder = frame.release.mock.invocationCallOrder[0];
    assert.isDefined(releaseOrder);
    expect(sample.close.mock.invocationCallOrder[0]).toBeLessThan(releaseOrder);
  }
});

it('closes the sample and releases the canvas once when add fails', async () => {
  const error = new Error('encoder refused frame');
  const frame = { canvas: document.createElement('canvas'), release: vi.fn() };
  mocks.add.mockRejectedValueOnce(error);

  await expect(
    encodePersistentVideoPreview({ ...createParams(), onFrame: async () => frame })
  ).rejects.toBe(error);

  expect(mocks.samples[0]?.close).toHaveBeenCalledExactlyOnceWith();
  expect(frame.release).toHaveBeenCalledExactlyOnceWith();
  expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith();
  expect(mocks.finalize).not.toHaveBeenCalled();
});

it('releases the returned canvas without constructing a sample when cancelled during onFrame', async () => {
  const controller = new AbortController();
  const frame = { canvas: document.createElement('canvas'), release: vi.fn() };

  await expect(
    encodePersistentVideoPreview({
      ...createParams(),
      onFrame: async () => {
        controller.abort();
        return frame;
      },
      signal: controller.signal,
    })
  ).rejects.toMatchObject({ name: 'AbortError' });

  expect(frame.release).toHaveBeenCalledExactlyOnceWith();
  expect(mocks.sampleCreate).not.toHaveBeenCalled();
  expect(mocks.add).not.toHaveBeenCalled();
  expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith();
});

it('holds the sample and canvas until an in-flight add settles after cancellation', async () => {
  const controller = new AbortController();
  const pending = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  const frame = { canvas: document.createElement('canvas'), release: vi.fn() };
  mocks.add.mockImplementationOnce(() => {
    entered.resolve();
    return pending.promise;
  });
  const encoding = encodePersistentVideoPreview({
    ...createParams(),
    onFrame: async () => frame,
    signal: controller.signal,
  });
  const rejected = expect(encoding).rejects.toMatchObject({ name: 'AbortError' });
  await entered.promise;
  controller.abort();

  expect(frame.release).not.toHaveBeenCalled();
  expect(mocks.samples[0]?.close).not.toHaveBeenCalled();
  pending.resolve();
  await rejected;

  expect(mocks.samples[0]?.close).toHaveBeenCalledExactlyOnceWith();
  expect(frame.release).toHaveBeenCalledExactlyOnceWith();
  expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith();
  expect(mocks.finalize).not.toHaveBeenCalled();
});

it('releases the canvas when sample construction fails', async () => {
  const error = new Error('cannot capture canvas');
  const frame = { canvas: document.createElement('canvas'), release: vi.fn() };
  mocks.sampleCreate.mockImplementationOnce(() => {
    throw error;
  });

  await expect(
    encodePersistentVideoPreview({ ...createParams(), onFrame: async () => frame })
  ).rejects.toBe(error);

  expect(frame.release).toHaveBeenCalledExactlyOnceWith();
  expect(mocks.add).not.toHaveBeenCalled();
  expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith();
});

it('does not request a frame when already cancelled', async () => {
  const controller = new AbortController();
  controller.abort();
  const params = { ...createParams(), signal: controller.signal };

  await expect(encodePersistentVideoPreview(params)).rejects.toMatchObject({ name: 'AbortError' });

  expect(params.onFrame).not.toHaveBeenCalled();
  expect(mocks.sampleCreate).not.toHaveBeenCalled();
  expect(mocks.add).not.toHaveBeenCalled();
  expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith();
});
