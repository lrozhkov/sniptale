// @vitest-environment jsdom

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

vi.mock('../shared/media', () => ({
  pauseRenderLoopMediaElements: pauseRenderLoopMediaElementsMock,
}));

vi.mock('../shared/timing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared/timing')>()),
  getRenderLoopCurrentTime: getRenderLoopCurrentTimeMock,
  getRenderLoopDuration: getRenderLoopDurationMock,
  getRenderLoopFps: getRenderLoopFpsMock,
  getRenderLoopTotalFrames: getRenderLoopTotalFramesMock,
}));

vi.mock('../../runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime')>()),
  waitForDelay: waitForDelayMock,
}));

vi.mock('../../effect-runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../effect-runtime')>()),
  createOffscreenProjectEffectRuntime: createEffectRuntimeMock,
}));

vi.mock('./frame', () => ({
  renderCompositeFrame: renderCompositeFrameMock,
}));

import {
  VideoExportFormat,
  VideoExportQualityPreset,
  type VideoProjectExportSettings,
} from '../../../../features/video/project/types';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import type { LoadedImagesMap } from '../../renderer';
import type { RenderLoopJobState } from '../shared';
import { runCompositeRenderLoop } from './run';

const RENDERS_COMPOSITE_FRAMES_CASE =
  'renders composite frames in sequence, forwards the abort signal, and reuses the last progress timestamp';

function createProject(duration = 3) {
  return { ...createEmptyVideoProject('Project', 1280, 720), duration };
}

function createSettings(
  overrides: Partial<VideoProjectExportSettings> = {}
): VideoProjectExportSettings {
  return {
    width: 1280,
    height: 720,
    fps: 2,
    quality: VideoExportQualityPreset.BALANCED,
    format: VideoExportFormat.WEBM,
    downloadAfterExport: true,
    ...overrides,
  };
}

function createJob(cancelled = false): RenderLoopJobState {
  return {
    cancelled,
    jobId: 'job-1',
    clipMediaElements: new Map(),
    clipAudioNodes: new Map(),
  };
}

function createLoadedImages(): LoadedImagesMap {
  return {};
}

function createRenderContext(): CanvasRenderingContext2D {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) {
    throw new Error('Expected test canvas context.');
  }
  return context;
}

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
    createJob(),
    createProject(),
    createSettings(),
    createRenderContext(),
    createLoadedImages(),
    controller.signal
  );

  expect(pauseRenderLoopMediaElementsMock).toHaveBeenCalledOnce();
  expect(pauseRenderLoopMediaElementsMock.mock.invocationCallOrder[0]).toBeLessThan(
    renderCompositeFrameMock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
  );
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
    createJob(),
    createProject(5),
    createSettings({ rangeEndSeconds: 3.5, rangeStartSeconds: 1 }),
    createRenderContext(),
    createLoadedImages()
  );

  expect(getRenderLoopDurationMock).toHaveBeenCalledWith(2.5);
  expect(renderCompositeFrameMock.mock.calls.map(([args]) => args.currentTime)).toEqual([
    1, 1.5, 2,
  ]);
});

it('aborts before rendering when the job has already been cancelled', async () => {
  await expect(
    runCompositeRenderLoop(
      createJob(true),
      createProject(),
      createSettings(),
      createRenderContext(),
      createLoadedImages()
    )
  ).rejects.toThrow('PROJECT_EXPORT_CANCELLED');

  expect(pauseRenderLoopMediaElementsMock).toHaveBeenCalledOnce();
  expect(renderCompositeFrameMock).not.toHaveBeenCalled();
  expect(waitForDelayMock).not.toHaveBeenCalled();
  expect(effectRuntimeDisposeMock).toHaveBeenCalledOnce();
});

it('disposes the reusable effect runtime when frame rendering fails', async () => {
  renderCompositeFrameMock.mockReset().mockRejectedValueOnce(new Error('render failed'));

  await expect(
    runCompositeRenderLoop(
      createJob(),
      createProject(),
      createSettings(),
      createRenderContext(),
      createLoadedImages()
    )
  ).rejects.toThrow('render failed');

  expect(effectRuntimeDisposeMock).toHaveBeenCalledOnce();
  expect(waitForDelayMock).not.toHaveBeenCalled();
});
