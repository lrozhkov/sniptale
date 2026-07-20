import { beforeEach, expect, it, vi } from 'vitest';

const {
  getRenderLoopCurrentTimeMock,
  getRenderLoopDurationMock,
  getRenderLoopFpsMock,
  getRenderLoopTotalFramesMock,
  pauseRenderLoopMediaElementsMock,
  renderCompositeFrameMock,
  effectRuntimeDisposeMock,
  createEffectRuntimeMock,
  waitForDelayMock,
} = vi.hoisted(() => ({
  getRenderLoopCurrentTimeMock: vi.fn(),
  getRenderLoopDurationMock: vi.fn(),
  getRenderLoopFpsMock: vi.fn(),
  getRenderLoopTotalFramesMock: vi.fn(),
  pauseRenderLoopMediaElementsMock: vi.fn(),
  renderCompositeFrameMock: vi.fn(),
  effectRuntimeDisposeMock: vi.fn(),
  createEffectRuntimeMock: vi.fn(),
  waitForDelayMock: vi.fn(),
}));

vi.mock('../../shared/media', () => ({
  pauseRenderLoopMediaElements: pauseRenderLoopMediaElementsMock,
}));

vi.mock('../../shared/timing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/timing')>()),
  getRenderLoopCurrentTime: getRenderLoopCurrentTimeMock,
  getRenderLoopDuration: getRenderLoopDurationMock,
  getRenderLoopFps: getRenderLoopFpsMock,
  getRenderLoopTotalFrames: getRenderLoopTotalFramesMock,
}));

vi.mock('../../../runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../runtime')>()),
  waitForDelay: waitForDelayMock,
}));

vi.mock('../../../effect-runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../effect-runtime')>()),
  createOffscreenProjectEffectRuntime: createEffectRuntimeMock,
}));

vi.mock('./frame', () => ({
  renderCompositeFrame: renderCompositeFrameMock,
}));

import { runCompositeRenderLoop } from './orchestrate';

const RENDERS_COMPOSITE_FRAMES_CASE =
  'renders composite frames in sequence, forwards the abort signal, and reuses the last progress timestamp';

beforeEach(() => {
  vi.clearAllMocks();
  getRenderLoopDurationMock.mockReturnValue(3);
  getRenderLoopFpsMock.mockReturnValue(2);
  getRenderLoopTotalFramesMock.mockReturnValue(3);
  getRenderLoopCurrentTimeMock.mockImplementation((frameIndex: number) => frameIndex * 0.5);
  pauseRenderLoopMediaElementsMock.mockResolvedValue(undefined);
  renderCompositeFrameMock
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(1234)
    .mockResolvedValueOnce(null);
  createEffectRuntimeMock.mockReturnValue({
    dispose: effectRuntimeDisposeMock,
    renderProjectFrames: vi.fn(),
  });
  waitForDelayMock.mockResolvedValue(undefined);
  vi.spyOn(performance, 'now').mockReturnValue(100);
});

it(RENDERS_COMPOSITE_FRAMES_CASE, async () => {
  const controller = new AbortController();

  await runCompositeRenderLoop(
    { cancelled: false } as never,
    { duration: 3 } as never,
    { fps: 2 } as never,
    {} as CanvasRenderingContext2D,
    {} as never,
    controller.signal
  );

  expect(pauseRenderLoopMediaElementsMock).toHaveBeenCalledOnce();
  expect(renderCompositeFrameMock.mock.calls.map(([args]) => args.lastProgressSent)).toEqual([
    0, 0, 1234,
  ]);
  expect(renderCompositeFrameMock.mock.calls.map(([args]) => args.signal)).toEqual([
    controller.signal,
    controller.signal,
    controller.signal,
  ]);
  expect(renderCompositeFrameMock.mock.calls[0]?.[0].effectRuntime).toEqual(
    expect.objectContaining({ dispose: effectRuntimeDisposeMock })
  );
  expect(effectRuntimeDisposeMock).toHaveBeenCalledOnce();
  expect(waitForDelayMock).toHaveBeenCalledTimes(2);
  expect(waitForDelayMock).toHaveBeenNthCalledWith(1, expect.any(Number), controller.signal);
});

it('offsets frame times by the selected export range start', async () => {
  await runCompositeRenderLoop(
    { cancelled: false } as never,
    { duration: 5 } as never,
    { fps: 2, rangeEndSeconds: 3.5, rangeStartSeconds: 1 } as never,
    {} as CanvasRenderingContext2D,
    {} as never
  );

  expect(getRenderLoopDurationMock).toHaveBeenCalledWith(2.5);
  expect(renderCompositeFrameMock.mock.calls.map(([args]) => args.currentTime)).toEqual([
    1, 1.5, 2,
  ]);
});

it('aborts before rendering when the job has already been cancelled', async () => {
  await expect(
    runCompositeRenderLoop(
      { cancelled: true } as never,
      { duration: 3 } as never,
      { fps: 2 } as never,
      {} as CanvasRenderingContext2D,
      {} as never
    )
  ).rejects.toThrow('PROJECT_EXPORT_CANCELLED');

  expect(pauseRenderLoopMediaElementsMock).toHaveBeenCalledOnce();
  expect(renderCompositeFrameMock).not.toHaveBeenCalled();
  expect(waitForDelayMock).not.toHaveBeenCalled();
});
