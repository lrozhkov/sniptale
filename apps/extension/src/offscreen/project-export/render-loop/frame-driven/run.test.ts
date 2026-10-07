import { beforeEach, expect, it, vi } from 'vitest';

const {
  adaptiveWriterMock,
  encodeCanvasMock,
  getFrameDrivenRenderCurrentTimeMock,
  getFrameDrivenRenderTimingMock,
  maybeSendFrameDrivenProgressMock,
  effectRuntimeDisposeMock,
  pauseRenderLoopMediaElementsMock,
  createEffectRuntimeMock,
  renderFrameDrivenCompositeFrameMock,
} = vi.hoisted(() => ({
  adaptiveWriterMock: vi.fn(),
  encodeCanvasMock: vi.fn(),
  getFrameDrivenRenderCurrentTimeMock: vi.fn(),
  getFrameDrivenRenderTimingMock: vi.fn(),
  maybeSendFrameDrivenProgressMock: vi.fn(),
  effectRuntimeDisposeMock: vi.fn(),
  pauseRenderLoopMediaElementsMock: vi.fn(),
  createEffectRuntimeMock: vi.fn(),
  renderFrameDrivenCompositeFrameMock: vi.fn(),
}));

vi.mock('../../../../features/video/project/export/adaptive-frames', () => ({
  createAdaptiveFrameWriter: adaptiveWriterMock,
}));
vi.mock('./render/encode', () => ({ encodeCompositeCanvasFrame: encodeCanvasMock }));

vi.mock('../shared/media', () => ({
  pauseRenderLoopMediaElements: pauseRenderLoopMediaElementsMock,
}));

vi.mock('../../effect-runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../effect-runtime')>()),
  createOffscreenProjectEffectRuntime: createEffectRuntimeMock,
}));

vi.mock('./timing', () => ({
  getFrameDrivenRenderCurrentTime: getFrameDrivenRenderCurrentTimeMock,
  getFrameDrivenRenderTiming: getFrameDrivenRenderTimingMock,
}));

vi.mock('./render/index', () => ({
  renderFrameDrivenCompositeFrame: renderFrameDrivenCompositeFrameMock,
}));

vi.mock('./progress', () => ({
  maybeSendFrameDrivenProgress: maybeSendFrameDrivenProgressMock,
}));

import { runFrameDrivenCompositeRenderLoop as runFrameDrivenCompositeRenderLoopRoot } from './index';
import { runFrameDrivenCompositeRenderLoop } from './run';

beforeEach(() => {
  vi.clearAllMocks();
  getFrameDrivenRenderTimingMock.mockReturnValue({
    duration: 2,
    fps: 4,
    frameDurationUs: 250_000,
    keyframeInterval: 12,
    totalFrames: 3,
  });
  getFrameDrivenRenderCurrentTimeMock.mockImplementation((frameIndex: number) => frameIndex * 0.25);
  pauseRenderLoopMediaElementsMock.mockResolvedValue(undefined);
  createEffectRuntimeMock.mockReturnValue({
    dispose: effectRuntimeDisposeMock,
    renderProjectFrames: vi.fn(),
  });
  renderFrameDrivenCompositeFrameMock.mockResolvedValue(undefined);
  maybeSendFrameDrivenProgressMock
    .mockResolvedValueOnce(0)
    .mockResolvedValueOnce(2)
    .mockResolvedValueOnce(2);
});

it('keeps the frame-driven render loop facade aligned', () => {
  expect(runFrameDrivenCompositeRenderLoopRoot).toBe(runFrameDrivenCompositeRenderLoop);
});

it('renders all frames, forwards the abort signal, and reuses the last progress frame', async () => {
  const controller = new AbortController();

  await runFrameDrivenCompositeRenderLoop(
    { cancelled: false } as never,
    { duration: 2 } as never,
    { fps: 4 } as never,
    {} as HTMLCanvasElement,
    {} as CanvasRenderingContext2D,
    {} as never,
    {} as VideoEncoder,
    vi.fn(),
    controller.signal
  );

  expect(pauseRenderLoopMediaElementsMock).toHaveBeenCalledOnce();
  expect(renderFrameDrivenCompositeFrameMock).toHaveBeenCalledTimes(3);
  expect(renderFrameDrivenCompositeFrameMock.mock.calls.map(([args]) => args.signal)).toEqual([
    controller.signal,
    controller.signal,
    controller.signal,
  ]);
  expect(renderFrameDrivenCompositeFrameMock.mock.calls[0]?.[0].effectRuntime).toEqual(
    expect.objectContaining({ dispose: effectRuntimeDisposeMock })
  );
  expect(effectRuntimeDisposeMock).toHaveBeenCalledOnce();
  expect(
    maybeSendFrameDrivenProgressMock.mock.calls.map(([args]) => args.lastProgressFrame)
  ).toEqual([-1, 0, 2]);
});

it('omits the abort signal when the loop is called without one', async () => {
  await runFrameDrivenCompositeRenderLoop(
    { cancelled: false } as never,
    { duration: 2 } as never,
    { fps: 4 } as never,
    {} as HTMLCanvasElement,
    {} as CanvasRenderingContext2D,
    {} as never,
    {} as VideoEncoder,
    vi.fn()
  );

  expect(renderFrameDrivenCompositeFrameMock.mock.calls[0]?.[0]).not.toHaveProperty('signal');
});

it('offsets frame-driven render times by the selected export range start', async () => {
  await runFrameDrivenCompositeRenderLoop(
    { cancelled: false } as never,
    { duration: 6 } as never,
    { fps: 4, rangeEndSeconds: 3, rangeStartSeconds: 1 } as never,
    {} as HTMLCanvasElement,
    {} as CanvasRenderingContext2D,
    {} as never,
    {} as VideoEncoder,
    vi.fn()
  );

  expect(getFrameDrivenRenderTimingMock).toHaveBeenCalledWith(2, 4);
  expect(renderFrameDrivenCompositeFrameMock.mock.calls.map(([args]) => args.currentTime)).toEqual([
    1, 1.25, 1.5,
  ]);
});

it('keeps the progress message detail across frame-driven progress updates', async () => {
  await runFrameDrivenCompositeRenderLoop(
    { cancelled: false } as never,
    { duration: 2 } as never,
    { fps: 4 } as never,
    {} as HTMLCanvasElement,
    {} as CanvasRenderingContext2D,
    {} as never,
    {} as VideoEncoder,
    vi.fn(),
    undefined,
    0,
    'Hybrid MP4: reason'
  );

  expect(maybeSendFrameDrivenProgressMock.mock.calls.map(([args]) => args.messageDetail)).toEqual([
    'Hybrid MP4: reason',
    'Hybrid MP4: reason',
    'Hybrid MP4: reason',
  ]);
});

it('uses rounded 60 Hz boundaries, clips the tail, flushes and releases a single adaptive writer', async () => {
  const add = vi.fn();
  const flush = vi.fn();
  const dispose = vi.fn();
  adaptiveWriterMock.mockReturnValue({ add, flush, dispose });
  getFrameDrivenRenderTimingMock.mockReturnValue({
    duration: 0.1,
    fps: 60,
    frameDurationUs: 16667,
    keyframeInterval: 120,
    totalFrames: 6,
  });
  renderFrameDrivenCompositeFrameMock.mockImplementation(async (args) =>
    args.adaptiveFrameWriter.add(args.frameTimestampUs, args.frameDurationUs)
  );
  const signal = new AbortController().signal;
  const context = {} as CanvasRenderingContext2D;
  await runFrameDrivenCompositeRenderLoop(
    { cancelled: false } as never,
    { duration: 5 } as never,
    {
      fps: 60,
      frameRateMode: 'adaptive',
      rangeStartSeconds: 1.123,
      rangeEndSeconds: 1.164,
    } as never,
    {} as HTMLCanvasElement,
    context,
    {} as never,
    {} as VideoEncoder,
    vi.fn(),
    signal,
    123456
  );
  expect(adaptiveWriterMock).toHaveBeenCalledOnce();
  expect(adaptiveWriterMock).toHaveBeenCalledWith(context, expect.any(Function), signal);
  expect(add.mock.calls).toEqual([
    [123456, 16667],
    [140123, 16666],
    [156789, 7667],
  ]);
  expect(flush).toHaveBeenCalledOnce();
  expect(dispose).toHaveBeenCalledOnce();
});

it('requests adaptive keyframes by elapsed time and refuses emission after cancellation', async () => {
  const retained = {} as HTMLCanvasElement;
  const job = { cancelled: false };
  const dispose = vi.fn();
  adaptiveWriterMock.mockImplementation((_context, emit) => ({
    add: vi.fn(),
    flush: async () => {
      for (const timestamp of [0, 200000, 1999999, 2000000, 2200000])
        await emit(retained, timestamp, 16667);
      job.cancelled = true;
      await emit(retained, 2400000, 1000);
    },
    dispose,
  }));
  await expect(
    runFrameDrivenCompositeRenderLoop(
      job as never,
      { duration: 3 } as never,
      { fps: 60, frameRateMode: 'adaptive' } as never,
      {} as HTMLCanvasElement,
      {} as CanvasRenderingContext2D,
      {} as never,
      {} as VideoEncoder,
      vi.fn()
    )
  ).rejects.toThrow('PROJECT_EXPORT_CANCELLED');
  expect(encodeCanvasMock.mock.calls.map(([args]) => args.keyFrame)).toEqual([
    true,
    false,
    false,
    true,
    false,
  ]);
  expect(encodeCanvasMock.mock.calls[0]?.[0].canvas).toBe(retained);
  expect(dispose).toHaveBeenCalledOnce();
  expect(effectRuntimeDisposeMock).toHaveBeenCalledOnce();
});

it('discards the adaptive tail and releases resources when rendering fails', async () => {
  const flush = vi.fn();
  const dispose = vi.fn();
  adaptiveWriterMock.mockReturnValue({ add: vi.fn(), flush, dispose });
  renderFrameDrivenCompositeFrameMock.mockRejectedValueOnce(new Error('render failed'));
  await expect(
    runFrameDrivenCompositeRenderLoop(
      { cancelled: false } as never,
      { duration: 3 } as never,
      { fps: 60, frameRateMode: 'adaptive' } as never,
      {} as HTMLCanvasElement,
      {} as CanvasRenderingContext2D,
      {} as never,
      {} as VideoEncoder,
      vi.fn()
    )
  ).rejects.toThrow('render failed');
  expect(flush).not.toHaveBeenCalled();
  expect(dispose).toHaveBeenCalledOnce();
  expect(effectRuntimeDisposeMock).toHaveBeenCalledOnce();
});

it('releases the effect runtime if adaptive snapshot allocation fails', async () => {
  adaptiveWriterMock.mockImplementationOnce(() => {
    throw new Error('canvas unavailable');
  });
  await expect(
    runFrameDrivenCompositeRenderLoop(
      { cancelled: false } as never,
      { duration: 3 } as never,
      { fps: 60, frameRateMode: 'adaptive' } as never,
      {} as HTMLCanvasElement,
      {} as CanvasRenderingContext2D,
      {} as never,
      {} as VideoEncoder,
      vi.fn()
    )
  ).rejects.toThrow('canvas unavailable');
  expect(effectRuntimeDisposeMock).toHaveBeenCalledOnce();
});

it('does not create a zero-duration tail when the rounded end equals a lattice timestamp', async () => {
  const add = vi.fn();
  adaptiveWriterMock.mockReturnValue({ add, flush: vi.fn(), dispose: vi.fn() });
  getFrameDrivenRenderTimingMock.mockReturnValue({
    duration: 0.1,
    fps: 60,
    frameDurationUs: 16667,
    keyframeInterval: 120,
    totalFrames: 6,
  });
  renderFrameDrivenCompositeFrameMock.mockImplementation(async (args) =>
    args.adaptiveFrameWriter.add(args.frameTimestampUs, args.frameDurationUs)
  );
  await runFrameDrivenCompositeRenderLoop(
    { cancelled: false } as never,
    { duration: 1 } as never,
    { fps: 60, frameRateMode: 'adaptive', rangeEndSeconds: 0.016667 } as never,
    {} as HTMLCanvasElement,
    {} as CanvasRenderingContext2D,
    {} as never,
    {} as VideoEncoder,
    vi.fn()
  );
  expect(add.mock.calls).toEqual([[0, 16667]]);
});
