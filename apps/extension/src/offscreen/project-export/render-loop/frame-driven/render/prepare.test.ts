import { afterEach, expect, it, vi } from 'vitest';

import { createVideoCompositionTimelineIndex } from '../../../../../features/video/composition/timeline/frame/index';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
} from '../../../../../features/video/project/types';
import type { LoadedImagesMap } from '../../../renderer';
import type { RenderLoopJobState } from '../../shared/index';
import type { RenderFrameDrivenCompositeFrameArgs } from './types';

const syncVideoClipFrameMock = vi.hoisted(() => vi.fn());
const drawProjectFrameMock = vi.hoisted(() => vi.fn());
const renderOffscreenProjectEffectFramesMock = vi.hoisted(() => vi.fn());

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

import { prepareFrameDrivenCompositeFrame } from './prepare';

afterEach(() => {
  syncVideoClipFrameMock.mockReset();
  drawProjectFrameMock.mockReset();
  renderOffscreenProjectEffectFramesMock.mockReset();
});

it('rejects cancelled frame renders before touching the pipeline', async () => {
  await expect(
    prepareFrameDrivenCompositeFrame({
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
  expect(syncVideoClipFrameMock).not.toHaveBeenCalled();
  expect(drawProjectFrameMock).not.toHaveBeenCalled();
});

it('prepares the frame by syncing and drawing project content', async () => {
  syncVideoClipFrameMock.mockResolvedValue(undefined);
  renderOffscreenProjectEffectFramesMock.mockResolvedValue(undefined);
  const throwIfPipelineFailed = vi.fn();

  await prepareFrameDrivenCompositeFrame({
    canvas: {} as HTMLCanvasElement,
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
    videoEncoder: { encode: vi.fn() } as never,
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
});

it('uses the owned effect runtime when preparing indexed frames', async () => {
  syncVideoClipFrameMock.mockResolvedValue(undefined);
  const fixture = createIndexedEffectRuntimeFrameFixture();

  await prepareFrameDrivenCompositeFrame(fixture.args);

  expect(renderOffscreenProjectEffectFramesMock).not.toHaveBeenCalled();
  expect(fixture.effectRuntime.renderProjectFrames).toHaveBeenCalledWith({
    clipMediaElements: fixture.job.clipMediaElements,
    compositionIndex: fixture.compositionIndex,
    currentTime: 2.5,
    loadedImages: fixture.loadedImages,
    ownerDocument: undefined,
    project: fixture.project,
  });
  expect(drawProjectFrameMock).toHaveBeenCalledWith(
    fixture.context,
    fixture.project,
    fixture.settings,
    2.5,
    fixture.loadedImages,
    fixture.job.clipMediaElements,
    {
      compositionIndex: fixture.compositionIndex,
      effectRuntimeFrames: fixture.effectRuntimeFrames,
    }
  );
});

function createIndexedEffectRuntimeFrameFixture() {
  const effectRuntimeFrames = { framesByTime: new Map(), overlayFrames: new Map() };
  const effectRuntime = {
    dispose: vi.fn(),
    renderProjectFrames: vi.fn(async () => effectRuntimeFrames),
  };
  const project = createEmptyVideoProject('Renderer project');
  const compositionIndex = createVideoCompositionTimelineIndex(project);
  const loadedImages: LoadedImagesMap = {};
  const job: RenderLoopJobState = {
    cancelled: false,
    clipAudioNodes: new Map(),
    clipMediaElements: new Map([['clip', {} as HTMLMediaElement]]),
    jobId: 'job-1',
  };
  const settings = createExportSettings();
  const context = Object.assign({} as CanvasRenderingContext2D, { stroke: vi.fn() });
  const args: RenderFrameDrivenCompositeFrameArgs = {
    canvas: {} as HTMLCanvasElement,
    compositionIndex,
    context,
    currentTime: 2.5,
    frameDurationUs: 4_000,
    frameIndex: 3,
    job,
    keyframeInterval: 3,
    loadedImages,
    effectRuntime,
    project,
    settings,
    throwIfPipelineFailed: vi.fn(),
    videoEncoder: Object.assign({} as VideoEncoder, { encode: vi.fn() }),
  };
  return {
    args,
    compositionIndex,
    context,
    job,
    loadedImages,
    effectRuntimeFrames,
    effectRuntime,
    project,
    settings,
  };
}

function createExportSettings() {
  return {
    downloadAfterExport: true,
    format: VideoExportFormat.WEBM,
    fps: 30,
    height: 720,
    quality: VideoExportQualityPreset.BALANCED,
    width: 1280,
  };
}
