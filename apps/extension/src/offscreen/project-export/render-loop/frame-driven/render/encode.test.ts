import { afterEach, expect, it, vi } from 'vitest';

const waitForEncoderQueueCapacityMock = vi.hoisted(() => vi.fn());

vi.mock('../../../codecs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../codecs')>()),
  waitForEncoderQueueCapacity: waitForEncoderQueueCapacityMock,
}));

import { encodeFrameDrivenCompositeFrame } from './encode';

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
  FakeVideoFrame.instances = [];
  vi.unstubAllGlobals();
});

it('adds the optional timestamp offset for segmented composite rendering', async () => {
  vi.stubGlobal('VideoFrame', FakeVideoFrame as unknown as typeof VideoFrame);
  waitForEncoderQueueCapacityMock.mockResolvedValue(undefined);
  const encodeMock = vi.fn();

  await encodeFrameDrivenCompositeFrame({
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
    throwIfPipelineFailed: vi.fn(),
    timestampOffsetUs: 1_000_000,
    videoEncoder: { encode: encodeMock } as never,
  });

  expect(FakeVideoFrame.instances[0]?.init).toEqual({ duration: 4_000, timestamp: 1_012_000 });
});

it('encodes a frame with keyframe metadata', async () => {
  vi.stubGlobal('VideoFrame', FakeVideoFrame as unknown as typeof VideoFrame);
  waitForEncoderQueueCapacityMock.mockResolvedValue(undefined);
  const encodeMock = vi.fn();

  await encodeFrameDrivenCompositeFrame({
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
    throwIfPipelineFailed: vi.fn(),
    videoEncoder: { encode: encodeMock } as never,
  });

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
