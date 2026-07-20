import { beforeEach, expect, it, vi } from 'vitest';

const {
  getFrameDrivenRenderCurrentTimeMock,
  getFrameDrivenRenderTimingMock,
  maybeSendFrameDrivenProgressMock,
  effectRuntimeDisposeMock,
  pauseRenderLoopMediaElementsMock,
  createEffectRuntimeMock,
  renderFrameDrivenCompositeFrameMock,
} = vi.hoisted(() => ({
  getFrameDrivenRenderCurrentTimeMock: vi.fn(),
  getFrameDrivenRenderTimingMock: vi.fn(),
  maybeSendFrameDrivenProgressMock: vi.fn(),
  effectRuntimeDisposeMock: vi.fn(),
  pauseRenderLoopMediaElementsMock: vi.fn(),
  createEffectRuntimeMock: vi.fn(),
  renderFrameDrivenCompositeFrameMock: vi.fn(),
}));

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
