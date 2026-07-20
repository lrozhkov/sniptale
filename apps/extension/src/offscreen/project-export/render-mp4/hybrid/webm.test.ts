// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const canDecodeMock = vi.hoisted(() => vi.fn());
const drawProjectFrameMock = vi.hoisted(() => vi.fn());
const getPrimaryVideoTrackMock = vi.hoisted(() => vi.fn());
const loadBlobForAssetMock = vi.hoisted(() => vi.fn());
const samplesAtTimestampsMock = vi.hoisted(() => vi.fn());
const sendProgressMock = vi.hoisted(() => vi.fn());
const pauseRenderLoopMediaElementsMock = vi.hoisted(() => vi.fn());
const effectRuntimeDisposeMock = vi.hoisted(() => vi.fn());
const effectRuntimeRenderProjectFramesMock = vi.hoisted(() => vi.fn());
const waitForEncoderQueueCapacityMock = vi.hoisted(() => vi.fn());

const inputDisposeMocks: ReturnType<typeof vi.fn>[] = [];

vi.mock('mediabunny', () => ({
  BlobSource: class {
    constructor(public blob: Blob) {}
  },
  Input: class {
    dispose = vi.fn();

    constructor() {
      inputDisposeMocks.push(this.dispose);
    }

    getPrimaryVideoTrack = getPrimaryVideoTrackMock;
  },
  VideoSampleSink: class {
    samplesAtTimestamps = samplesAtTimestampsMock;
  },
  WEBM: {},
}));

vi.mock('../../media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../media')>()),
  loadBlobForAsset: loadBlobForAssetMock,
}));

vi.mock('../../renderer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../renderer')>()),
  drawProjectFrame: drawProjectFrameMock,
}));

vi.mock('../../effect-runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../effect-runtime')>()),
  createOffscreenProjectEffectRuntime: vi.fn(() => ({
    dispose: effectRuntimeDisposeMock,
    renderProjectFrames: effectRuntimeRenderProjectFramesMock,
  })),
}));

vi.mock('../../runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime')>()),
  sendProgress: sendProgressMock,
}));

vi.mock('../../codecs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../codecs')>()),
  waitForEncoderQueueCapacity: waitForEncoderQueueCapacityMock,
}));

vi.mock('../../render-loop/shared/media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../render-loop/shared/media')>()),
  pauseRenderLoopMediaElements: pauseRenderLoopMediaElementsMock,
}));

import { renderAcceleratedCompositeWebmSpan } from './webm';
import { createArgs } from './webm.test-support';

function createSample() {
  return {
    close: vi.fn(),
    displayHeight: 720,
    displayWidth: 1280,
    draw: vi.fn(),
  };
}

async function* createSamples(samples: unknown[]) {
  for (const sample of samples) {
    yield sample;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  inputDisposeMocks.length = 0;
  getPrimaryVideoTrackMock.mockResolvedValue({ canDecode: canDecodeMock });
  canDecodeMock.mockResolvedValue(true);
  loadBlobForAssetMock.mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])]));
  pauseRenderLoopMediaElementsMock.mockResolvedValue(undefined);
  effectRuntimeRenderProjectFramesMock.mockResolvedValue(undefined);
  sendProgressMock.mockResolvedValue(undefined);
  waitForEncoderQueueCapacityMock.mockResolvedValue(undefined);
  vi.stubGlobal(
    'VideoFrame',
    class {
      close = vi.fn();
      constructor(
        public source: HTMLCanvasElement,
        public init: VideoFrameInit
      ) {}
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('renders decoded WebM samples into canvas frames and forwards them to the encoder', async () => {
  const samples = [createSample(), createSample()];
  samplesAtTimestampsMock.mockReturnValue(createSamples(samples));
  const args = createArgs();

  await expect(renderAcceleratedCompositeWebmSpan(args)).resolves.toBe(true);

  expect(pauseRenderLoopMediaElementsMock).toHaveBeenCalledWith(args.job);
  expect(samplesAtTimestampsMock).toHaveBeenCalledWith([0, 0.5]);
  expect(drawProjectFrameMock).toHaveBeenCalledTimes(2);
  expect(effectRuntimeRenderProjectFramesMock).toHaveBeenCalledWith(
    expect.objectContaining({
      clipMediaElements: expect.any(Map),
      loadedImages: args.loadedImages,
      ownerDocument: args.context.canvas.ownerDocument,
    })
  );
  const rendererMediaMap = effectRuntimeRenderProjectFramesMock.mock.calls[0]?.[0]
    .clipMediaElements as ReadonlyMap<
    string,
    { draw: (context: CanvasRenderingContext2D) => void }
  >;
  rendererMediaMap.get('clip-1')?.draw(args.context);
  expect(samples[0]!.draw).toHaveBeenCalled();
  const mediaMap = drawProjectFrameMock.mock.calls[0]?.[5] as
    | ReadonlyMap<string, { draw: (context: CanvasRenderingContext2D) => void }>
    | undefined;
  mediaMap?.get('clip-1')?.draw(args.context);
  expect(samples[0]!.draw).toHaveBeenCalled();
  expect(args.videoEncoder.encode).toHaveBeenCalledTimes(2);
  expect(args.videoEncoder.encode.mock.calls.map(([frame]) => frame)).toEqual([
    expect.objectContaining({ init: expect.objectContaining({ timestamp: 0 }) }),
    expect.objectContaining({ init: expect.objectContaining({ timestamp: 500_000 }) }),
  ]);
  expect(samples[0]!.close).toHaveBeenCalledOnce();
  expect(samples[1]!.close).toHaveBeenCalledOnce();
  expect(inputDisposeMocks[0]).toHaveBeenCalledOnce();
});

it('passes the canvas owner document into accelerated WebM effect rendering', async () => {
  const canvas = document.createElement('canvas');
  const samples = [createSample(), createSample()];
  const args = createArgs();
  Object.defineProperty(args.context, 'canvas', { configurable: true, value: canvas });
  samplesAtTimestampsMock.mockReturnValue(createSamples(samples));

  await expect(renderAcceleratedCompositeWebmSpan(args)).resolves.toBe(true);

  expect(effectRuntimeRenderProjectFramesMock).toHaveBeenCalledWith(
    expect.objectContaining({ ownerDocument: canvas.ownerDocument })
  );
});

it('returns false when the WebM video track cannot be decoded', async () => {
  canDecodeMock.mockResolvedValue(false);

  await expect(renderAcceleratedCompositeWebmSpan(createArgs())).resolves.toBe(false);

  expect(samplesAtTimestampsMock).not.toHaveBeenCalled();
  expect(inputDisposeMocks[0]).toHaveBeenCalledOnce();
});

it('disposes providers when cancellation interrupts accelerated WebM rendering before sampling', async () => {
  const controller = new AbortController();
  controller.abort();
  const sample = createSample();
  samplesAtTimestampsMock.mockReturnValue(createSamples([sample]));

  await expect(
    renderAcceleratedCompositeWebmSpan({ ...createArgs(), signal: controller.signal })
  ).rejects.toThrow('aborted');

  expect(sample.close).not.toHaveBeenCalled();
  expect(inputDisposeMocks[0]).toHaveBeenCalledOnce();
});

it('closes yielded samples when pipeline failure interrupts accelerated WebM rendering', async () => {
  const sample = createSample();
  samplesAtTimestampsMock.mockReturnValue(createSamples([sample]));
  const args = createArgs();
  args.throwIfPipelineFailed
    .mockImplementationOnce(() => undefined)
    .mockImplementationOnce(() => {
      throw new Error('encode failed');
    });

  await expect(renderAcceleratedCompositeWebmSpan(args)).rejects.toThrow('encode failed');

  expect(sample.close).toHaveBeenCalledOnce();
  expect(inputDisposeMocks[0]).toHaveBeenCalledOnce();
});
