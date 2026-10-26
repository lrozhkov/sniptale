// @vitest-environment jsdom
import { createQuickEditWatermark } from '../../../../features/video/project/scene/watermark';

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

const spatialOwner = vi.hoisted(() => ({ get: vi.fn(() => ({ dispose: vi.fn() })) }));

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
  MP4: {},
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
  getProjectExportSpatialRenderer: spatialOwner.get,
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
    codedWidth: 1280,
    codedHeight: 720,
    rotation: 0,
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
  getPrimaryVideoTrackMock.mockResolvedValue({
    canDecode: canDecodeMock,
    getTimeResolution: vi.fn().mockResolvedValue(1_000_000),
    getDecoderConfig: vi
      .fn()
      .mockResolvedValue({ codec: 'vp8', colorSpace: { matrix: 'smpte170m' } }),
  });
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
  Reflect.deleteProperty(document, 'fonts');
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
  expect(args.videoEncoder.encode).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ avc: { quantizer: 24 } })
  );
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

it('does not acquire providers when accelerated rendering is already cancelled', async () => {
  const controller = new AbortController();
  controller.abort();
  const sample = createSample();
  samplesAtTimestampsMock.mockReturnValue(createSamples([sample]));

  await expect(
    renderAcceleratedCompositeWebmSpan({ ...createArgs(), signal: controller.signal })
  ).rejects.toThrow('aborted');

  expect(sample.close).not.toHaveBeenCalled();
  expect(inputDisposeMocks).toHaveLength(0);
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

it('defers untagged VP8 to the media-element renderer before encoding any frames', async () => {
  getPrimaryVideoTrackMock.mockResolvedValueOnce({
    canDecode: canDecodeMock,
    getTimeResolution: vi.fn().mockResolvedValue(1_000_000),
    getDecoderConfig: vi.fn().mockResolvedValue({ codec: 'vp8' }),
  });
  const args = createArgs();
  await expect(renderAcceleratedCompositeWebmSpan(args)).resolves.toBe(false);
  expect(args.videoEncoder.encode).not.toHaveBeenCalled();
  expect(drawProjectFrameMock).not.toHaveBeenCalled();
  expect(inputDisposeMocks[0]).toHaveBeenCalledOnce();
});

it('marks irreversible output only after the encoder accepts a frame', async () => {
  const sample = createSample();
  samplesAtTimestampsMock.mockReturnValue(createSamples([sample]));
  const args = createArgs();
  args.span.end = 0.5;
  const submitted = vi.fn();
  await renderAcceleratedCompositeWebmSpan({ ...args, onFrameSubmitted: submitted });
  expect(submitted).toHaveBeenCalledOnce();
  expect(args.videoEncoder.encode.mock.invocationCallOrder[0]).toBeLessThan(
    submitted.mock.invocationCallOrder[0]!
  );
});

it('burns authored captions into accelerated frames before encoding and refuses font failure', async () => {
  const args = createArgs();
  args.project.duration = 1;
  args.project.textDocuments = [
    {
      id: 'doc',
      binding: { kind: 'project' },
      captions: {
        enabled: true,
        style: { position: 'bottom', fontSize: 0.04, color: '#ffffff', background: '#000000' },
      },
      document: {
        version: 1,
        fragments: [
          {
            id: 'text',
            text: 'Accelerated caption',
            originalText: '',
            start: 0,
            end: 1,
            timeDomain: 'result',
            alignment: 'manual',
            revision: 0,
            timingRevision: 0,
            showInVideo: true,
          },
        ],
      },
    },
  ];
  const load = vi.fn(async () => [{ status: 'loaded' }]);
  Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });
  samplesAtTimestampsMock.mockImplementation(() => createSamples([createSample(), createSample()]));
  const fillText = vi.spyOn(args.context, 'fillText');
  await expect(renderAcceleratedCompositeWebmSpan(args)).resolves.toBe(true);
  expect(load).toHaveBeenCalledOnce();
  expect(fillText).toHaveBeenCalledWith(
    'Accelerated caption',
    expect.any(Number),
    expect.any(Number)
  );
  expect(drawProjectFrameMock.mock.invocationCallOrder[0]).toBeLessThan(
    fillText.mock.invocationCallOrder[0]!
  );
  expect(fillText.mock.invocationCallOrder[0]).toBeLessThan(
    args.videoEncoder.encode.mock.invocationCallOrder[0]!
  );
  fillText.mockRestore();
  load.mockResolvedValue([]);
  delete args.job.captionRenderer;
  await expect(renderAcceleratedCompositeWebmSpan(args)).rejects.toThrow(
    'Caption font is unavailable'
  );
  expect(args.videoEncoder.encode).toHaveBeenCalledTimes(2);
});

it('paints decoded composite watermark before encoding and never encodes a failed preparation', async () => {
  samplesAtTimestampsMock.mockImplementation(() => createSamples([createSample(), createSample()]));
  const args = createArgs();
  args.project.watermark = { ...createQuickEditWatermark('Mark'), mode: 'text' };
  const order: string[] = [];
  const draw = vi.fn(() => {
    order.push('watermark');
  });
  const prepare = vi.fn(async () => ({ bounds: { x: 0, y: 0, width: 20, height: 10 }, draw }));
  args.job.watermarkRenderer = { prepare, clear: vi.fn() };
  drawProjectFrameMock.mockImplementation(() => {
    order.push('scene');
  });
  args.videoEncoder.encode.mockImplementation(() => {
    order.push('encode');
  });
  await expect(renderAcceleratedCompositeWebmSpan(args)).resolves.toBe(true);
  expect(order).toEqual(['scene', 'watermark', 'encode', 'scene', 'watermark', 'encode']);
  prepare.mockRejectedValueOnce(new Error('Logo unavailable'));
  await expect(renderAcceleratedCompositeWebmSpan(args)).rejects.toThrow('Logo unavailable');
  expect(args.videoEncoder.encode).toHaveBeenCalledTimes(2);
});

it('shares the job spatial renderer between decoded effect capture and final output', async () => {
  samplesAtTimestampsMock.mockReturnValue(createSamples([createSample(), createSample()]));
  const args = createArgs();
  await expect(renderAcceleratedCompositeWebmSpan(args)).resolves.toBe(true);
  expect(spatialOwner.get).not.toHaveBeenCalled();
  const capture = effectRuntimeRenderProjectFramesMock.mock.calls[0]![0].spatialRenderer;
  const paint = drawProjectFrameMock.mock.calls[0]![6].spatialRenderer;
  expect(capture).toEqual(expect.any(Function));
  expect(paint).toEqual(expect.any(Function));
  capture();
  paint();
  expect(spatialOwner.get).toHaveBeenNthCalledWith(1, args.job, args.signal);
  expect(spatialOwner.get).toHaveBeenNthCalledWith(2, args.job, args.signal);
});

it('refuses direct decoded acceleration inside an active composition join before decoder acquisition', async () => {
  const args = createArgs();
  args.project.duration = 2;
  args.project.compositionJoins = [
    {
      id: 'join',
      clipId: 'clip-1',
      edge: 'end',
      transition: { type: 'dissolve', before: 0.2, after: 0.2 },
    },
  ];
  await expect(renderAcceleratedCompositeWebmSpan(args)).resolves.toBe(false);
  expect(loadBlobForAssetMock).not.toHaveBeenCalled();
  expect(getPrimaryVideoTrackMock).not.toHaveBeenCalled();
  expect(args.videoEncoder.encode).not.toHaveBeenCalled();
});
