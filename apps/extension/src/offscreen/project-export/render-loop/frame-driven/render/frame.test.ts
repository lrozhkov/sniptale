import { afterEach, expect, it, vi } from 'vitest';

const waitForEncoderQueueCapacityMock = vi.hoisted(() => vi.fn());
const syncVideoClipFrameMock = vi.hoisted(() => vi.fn());
const drawProjectFrameMock = vi.hoisted(() => vi.fn());
const renderOffscreenProjectEffectFramesMock = vi.hoisted(() => vi.fn());

vi.mock('../../../codecs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../codecs')>()),
  waitForEncoderQueueCapacity: waitForEncoderQueueCapacityMock,
}));

vi.mock('../../../media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../media')>()),
  syncVideoClipFrame: syncVideoClipFrameMock,
}));

vi.mock('../../../renderer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../renderer')>()),
  drawProjectFrame: drawProjectFrameMock,
}));

vi.mock('../../../effect-runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../effect-runtime')>()),
  renderOffscreenProjectEffectFrames: renderOffscreenProjectEffectFramesMock,
}));

import { renderFrameDrivenCompositeFrame } from './frame';

class FakeVideoFrame {
  static instances: FakeVideoFrame[] = [];
  close = vi.fn();

  constructor(
    public canvas: HTMLCanvasElement,
    public init: { duration: number; timestamp: number }
  ) {
    FakeVideoFrame.instances.push(this);
  }
}

afterEach(() => {
  waitForEncoderQueueCapacityMock.mockReset();
  syncVideoClipFrameMock.mockReset();
  drawProjectFrameMock.mockReset();
  renderOffscreenProjectEffectFramesMock.mockReset();
  FakeVideoFrame.instances = [];
  vi.unstubAllGlobals();
});

it('rejects cancelled frame renders before touching the pipeline', async () => {
  vi.stubGlobal('VideoFrame', FakeVideoFrame as unknown as typeof VideoFrame);

  await expect(
    renderFrameDrivenCompositeFrame({
      canvas: {} as HTMLCanvasElement,
      context: {} as CanvasRenderingContext2D,
      currentTime: 1,
      frameDurationUs: 2,
      frameIndex: 0,
      job: { cancelled: true } as never,
      keyframeInterval: 2,
      loadedImages: {} as never,
      project: {} as never,
      settings: {} as never,
      throwIfPipelineFailed: vi.fn(),
      videoEncoder: { encode: vi.fn() } as never,
    })
  ).rejects.toThrow('PROJECT_EXPORT_CANCELLED');
  expect(waitForEncoderQueueCapacityMock).not.toHaveBeenCalled();
  expect(syncVideoClipFrameMock).not.toHaveBeenCalled();
  expect(drawProjectFrameMock).not.toHaveBeenCalled();
});

it('renders, queues, and encodes a frame with keyframe metadata', async () => {
  vi.stubGlobal('VideoFrame', FakeVideoFrame as unknown as typeof VideoFrame);
  waitForEncoderQueueCapacityMock.mockResolvedValue(undefined);
  syncVideoClipFrameMock.mockResolvedValue(undefined);
  renderOffscreenProjectEffectFramesMock.mockResolvedValue(undefined);
  const encodeMock = vi.fn();
  const throwIfPipelineFailed = vi.fn();

  await renderFrameDrivenCompositeFrame({
    canvas: { tagName: 'CANVAS' } as HTMLCanvasElement,
    context: { stroke: vi.fn() } as never,
    currentTime: 2.5,
    frameDurationUs: 4_000,
    frameIndex: 3,
    job: { cancelled: false, clipMediaElements: ['clip'] } as never,
    keyframeInterval: 3,
    loadedImages: { image: 'loaded' } as never,
    project: { duration: 10 } as never,
    settings: { fps: 30 } as never,
    throwIfPipelineFailed,
    videoEncoder: { encode: encodeMock } as never,
  });

  expect(throwIfPipelineFailed).toHaveBeenCalledTimes(1);
  expect(syncVideoClipFrameMock).toHaveBeenCalledWith(
    expect.objectContaining({ cancelled: false, clipMediaElements: ['clip'] }),
    { duration: 10 },
    2.5,
    undefined
  );
  expect(drawProjectFrameMock).toHaveBeenCalledWith(
    { stroke: expect.any(Function) },
    { duration: 10 },
    { fps: 30 },
    2.5,
    { image: 'loaded' },
    ['clip'],
    {}
  );
  expect(waitForEncoderQueueCapacityMock).toHaveBeenCalledWith(
    { encode: encodeMock },
    6,
    undefined
  );
  expect(encodeMock).toHaveBeenCalledTimes(1);
  expect(encodeMock).toHaveBeenCalledWith(FakeVideoFrame.instances[0], { keyFrame: true });
  expect(FakeVideoFrame.instances[0]?.init).toEqual({ duration: 4_000, timestamp: 12_000 });
  expect(FakeVideoFrame.instances[0]?.close).toHaveBeenCalledTimes(1);
});
