import { beforeEach, expect, it, vi } from 'vitest';

const createFileMock = vi.hoisted(() => vi.fn());
const loadBlobForAssetMock = vi.hoisted(() => vi.fn());
const waitForEncoderQueueCapacityMock = vi.hoisted(() => vi.fn());

vi.mock('@webav/mp4box.js', () => ({
  DataStream: class {
    static BIG_ENDIAN = false;
    buffer = new ArrayBuffer(12);
  },
  createFile: createFileMock,
}));

vi.mock('../../media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../media')>()),
  loadBlobForAsset: loadBlobForAssetMock,
}));

vi.mock('../../codecs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../codecs')>()),
  waitForEncoderQueueCapacity: waitForEncoderQueueCapacityMock,
}));

import { encodeCleanSourceMp4Span } from './demux';

function createMp4FileMock(samples: unknown[]) {
  const file = {
    onError: undefined as ((error: unknown) => void) | undefined,
    onReady: undefined as ((info: unknown) => void) | undefined,
    onSamples: undefined as ((id: number, user: unknown, samples: unknown[]) => void) | undefined,
    appendBuffer: vi.fn(() => {
      file.onReady?.({
        videoTracks: [{ codec: 'avc1.42E01E', id: 1, nb_samples: samples.length || 1 }],
      });
      return 0;
    }),
    flush: vi.fn(() => {
      file.onSamples?.(1, null, samples);
    }),
    releaseUsedSamples: vi.fn(),
    setExtractionOptions: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  return file;
}

function createSpan() {
  return {
    asset: { id: 'asset-1' },
    clip: { transform: { height: 720, width: 1280 } },
    end: 1,
    kind: 'clean-source',
    sourceEnd: 1,
    sourceStart: 0,
    start: 0,
  };
}

function createSample(overrides: Record<string, unknown> = {}) {
  return {
    cts: 0,
    data: new ArrayBuffer(4),
    duration: 1,
    is_rap: true,
    timescale: 1,
    ...overrides,
  };
}

function installSuccessfulWebCodecs(
  closeFrameMock: ReturnType<typeof vi.fn>,
  outputFrame: Record<string, unknown> = { duration: 1_000_000, timestamp: 0 }
) {
  class VideoDecoderMock {
    static isConfigSupported = vi.fn(async (config: VideoDecoderConfig) => ({
      config,
      supported: true,
    }));
    output: (frame: VideoFrame) => void;

    constructor(init: { output: (frame: VideoFrame) => void }) {
      this.output = init.output;
    }

    close = vi.fn();
    configure = vi.fn();
    decode = vi.fn(() => {
      this.output({ close: closeFrameMock, ...outputFrame } as never);
    });
    flush = vi.fn(async () => undefined);
  }

  class VideoFrameMock {
    close = vi.fn();
    duration: number | null;
    timestamp: number;

    constructor(source: VideoFrame, init: VideoFrameInit) {
      this.duration = init.duration ?? null;
      this.timestamp = init.timestamp ?? source.timestamp;
    }
  }

  class EncodedVideoChunkMock {
    constructor(public init: EncodedVideoChunkInit) {}
  }

  vi.stubGlobal('VideoDecoder', VideoDecoderMock as never);
  vi.stubGlobal('VideoFrame', VideoFrameMock as never);
  vi.stubGlobal('EncodedVideoChunk', EncodedVideoChunkMock as never);
  return { VideoFrameMock };
}

function createThrowingMp4FileMock() {
  return {
    appendBuffer: vi.fn(() => {
      throw new Error('parse failed');
    }),
    flush: vi.fn(),
    onError: undefined,
    onReady: undefined,
    releaseUsedSamples: vi.fn(),
    setExtractionOptions: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  loadBlobForAssetMock.mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])]));
  waitForEncoderQueueCapacityMock.mockResolvedValue(undefined);
  vi.unstubAllGlobals();
});

it('returns false when VideoDecoder is unavailable', async () => {
  vi.stubGlobal('VideoDecoder', undefined);

  await expect(
    encodeCleanSourceMp4Span({
      span: createSpan() as never,
      throwIfPipelineFailed: vi.fn(),
      videoEncoder: { encode: vi.fn() } as never,
    })
  ).resolves.toBe(false);
});

it('returns false when the source has no samples inside the span', async () => {
  createFileMock.mockReturnValue(createMp4FileMock([]));
  vi.stubGlobal('VideoDecoder', { isConfigSupported: vi.fn() });

  await expect(
    encodeCleanSourceMp4Span({
      span: createSpan() as never,
      throwIfPipelineFailed: vi.fn(),
      videoEncoder: { encode: vi.fn() } as never,
    })
  ).resolves.toBe(false);
});

it('returns false when the source decoder config is unsupported', async () => {
  createFileMock.mockReturnValue(createMp4FileMock([createSample()]));
  vi.stubGlobal('VideoDecoder', {
    isConfigSupported: vi.fn(async () => ({ supported: false })),
  });

  await expect(
    encodeCleanSourceMp4Span({
      span: createSpan() as never,
      throwIfPipelineFailed: vi.fn(),
      videoEncoder: { encode: vi.fn() } as never,
    })
  ).resolves.toBe(false);
});

it('returns false when decoder support probing rejects', async () => {
  createFileMock.mockReturnValue(createMp4FileMock([createSample()]));
  vi.stubGlobal('VideoDecoder', {
    isConfigSupported: vi.fn(async () => {
      throw new Error('probe failed');
    }),
  });

  await expect(
    encodeCleanSourceMp4Span({
      span: createSpan() as never,
      throwIfPipelineFailed: vi.fn(),
      videoEncoder: { encode: vi.fn() } as never,
    })
  ).resolves.toBe(false);
});

it('rejects source parse failures', async () => {
  createFileMock.mockReturnValue(createThrowingMp4FileMock());
  vi.stubGlobal('VideoDecoder', { isConfigSupported: vi.fn() });

  await expect(
    encodeCleanSourceMp4Span({
      span: createSpan() as never,
      throwIfPipelineFailed: vi.fn(),
      videoEncoder: { encode: vi.fn() } as never,
    })
  ).rejects.toThrow('parse failed');
});

it('rejects when the source MP4 has no video track', async () => {
  const file = createMp4FileMock([]);
  file.appendBuffer.mockImplementationOnce(() => {
    file.onReady?.({ videoTracks: [] });
    return 0;
  });
  createFileMock.mockReturnValue(file);
  vi.stubGlobal('VideoDecoder', { isConfigSupported: vi.fn() });

  await expect(
    encodeCleanSourceMp4Span({
      span: createSpan() as never,
      throwIfPipelineFailed: vi.fn(),
      videoEncoder: { encode: vi.fn() } as never,
    })
  ).rejects.toThrow('no video track');
});

it('rejects aborted clean-source decoding', async () => {
  const controller = new AbortController();
  controller.abort();
  createFileMock.mockReturnValue(createMp4FileMock([createSample()]));
  installSuccessfulWebCodecs(vi.fn());

  await expect(
    encodeCleanSourceMp4Span({
      signal: controller.signal,
      span: createSpan() as never,
      throwIfPipelineFailed: vi.fn(),
      videoEncoder: { encode: vi.fn() } as never,
    })
  ).rejects.toThrow('aborted');
});

it('decodes source samples and forwards frames into the existing encoder', async () => {
  const encodeMock = vi.fn();
  const closeFrameMock = vi.fn();
  createFileMock.mockReturnValue(createMp4FileMock([createSample()]));
  const { VideoFrameMock } = installSuccessfulWebCodecs(closeFrameMock);

  await expect(
    encodeCleanSourceMp4Span({
      span: createSpan() as never,
      throwIfPipelineFailed: vi.fn(),
      videoEncoder: { encode: encodeMock } as never,
    })
  ).resolves.toBe(true);

  expect(waitForEncoderQueueCapacityMock).toHaveBeenCalledOnce();
  expect(encodeMock).toHaveBeenCalledWith(expect.any(VideoFrameMock), { keyFrame: true });
  expect(closeFrameMock).toHaveBeenCalledOnce();
});

it('accepts source decoder descriptions and frames without explicit duration', async () => {
  const closeFrameMock = vi.fn();
  createFileMock.mockReturnValue(
    createMp4FileMock([
      createSample({
        description: { avcC: { write: vi.fn() } },
      }),
    ])
  );
  installSuccessfulWebCodecs(closeFrameMock, { timestamp: 0 });

  await expect(
    encodeCleanSourceMp4Span({
      span: createSpan() as never,
      throwIfPipelineFailed: vi.fn(),
      videoEncoder: { encode: vi.fn() } as never,
    })
  ).resolves.toBe(true);

  expect(closeFrameMock).toHaveBeenCalledOnce();
});
