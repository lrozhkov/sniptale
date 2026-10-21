// @vitest-environment jsdom
import { createVideoProjectSceneEdges } from '../../../../../features/video/project/scene/edge-fades';
import { createQuickEditWatermark } from '../../../../../features/video/project/scene/watermark';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createVideoCompositionTimelineIndex } from '../../../../../features/video/composition/timeline/frame/index';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
} from '../../../../../features/video/project/types';
import { drawProjectFrame, type LoadedImagesMap } from '../../../renderer';
import type { RenderOffscreenProjectEffectFramesInput } from '../../../effect-runtime';
import type { RenderLoopJobState } from '../../shared/index';
import type { RenderFrameDrivenCompositeFrameArgs } from './types';

const captionOwner = vi.hoisted(() => ({
  prepare: vi.fn(),
  draw: vi.fn(),
  assertExportable: vi.fn(),
}));
vi.mock('../../../../../workflows/video-review/project-captions', () => ({
  createVideoProjectCaptionRenderer: () => ({ prepare: captionOwner.prepare, clear: vi.fn() }),
}));
beforeEach(() => {
  captionOwner.prepare.mockReset().mockResolvedValue({
    draw: captionOwner.draw,
    assertExportable: captionOwner.assertExportable,
  });
  captionOwner.draw.mockReset();
  captionOwner.assertExportable.mockReset();
});

const spatialOwner = vi.hoisted(() => ({
  get: vi.fn(() => ({ validateSizes: vi.fn(), surface: vi.fn(), draw: vi.fn(), dispose: vi.fn() })),
}));
vi.mock('../../../runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../runtime')>()),
  getProjectExportSpatialRenderer: spatialOwner.get,
}));
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
    { spatialRenderer: expect.any(Function) }
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
    spatialRenderer: expect.any(Function),
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
      spatialRenderer: expect.any(Function),
    }
  );
});

function createIndexedEffectRuntimeFrameFixture() {
  const effectRuntimeFrames = { framesByTime: new Map(), overlayFrames: new Map() };
  const effectRuntime = {
    dispose: vi.fn(),
    renderProjectFrames: vi.fn(
      async (_args: RenderOffscreenProjectEffectFramesInput) => effectRuntimeFrames
    ),
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
    resolution: 'SOURCE' as const,
    webmVideoCodec: 'VP9' as const,
    fps: 30,
    height: 720,
    quality: VideoExportQualityPreset.MEDIUM,
    width: 1280,
  };
}

it('passes lazy spatial factories to effect capture and final draw under the same export job', async () => {
  syncVideoClipFrameMock.mockResolvedValue(undefined);
  spatialOwner.get.mockClear();
  const fixture = createIndexedEffectRuntimeFrameFixture();
  await prepareFrameDrivenCompositeFrame(fixture.args);
  expect(spatialOwner.get).not.toHaveBeenCalled();
  const capture = fixture.effectRuntime.renderProjectFrames.mock.calls[0]![0].spatialRenderer!;
  const paint = vi.mocked(drawProjectFrame).mock.calls[0]![6]!.spatialRenderer!;
  capture();
  paint();
  expect(spatialOwner.get).toHaveBeenNthCalledWith(1, fixture.job, fixture.args.signal);
  expect(spatialOwner.get).toHaveBeenNthCalledWith(2, fixture.job, fixture.args.signal);
});

it('paints watermark after scene and captions and rejects unavailable watermark before drawing', async () => {
  const fixture = createIndexedEffectRuntimeFrameFixture();
  fixture.project.watermark = { ...createQuickEditWatermark('Mark'), mode: 'text' };
  const order: string[] = [];
  const draw = vi.fn(() => {
    order.push('watermark');
  });
  const prepare = vi.fn(async () => ({ bounds: { x: 0, y: 0, width: 20, height: 10 }, draw }));
  fixture.job.watermarkRenderer = { prepare, clear: vi.fn() };
  drawProjectFrameMock.mockImplementation(() => {
    order.push('scene');
  });
  captionOwner.draw.mockImplementation(() => order.push('captions'));
  await prepareFrameDrivenCompositeFrame(fixture.args);
  expect(order).toEqual(['scene', 'captions', 'watermark']);
  expect(prepare).toHaveBeenCalledWith(fixture.project, fixture.settings, undefined);
  prepare.mockRejectedValueOnce(new Error('Logo unavailable'));
  await expect(prepareFrameDrivenCompositeFrame(fixture.args)).rejects.toThrow('Logo unavailable');
  expect(draw).toHaveBeenCalledTimes(1);
  expect(drawProjectFrameMock).toHaveBeenCalledTimes(1);
});

it('refuses caption preparation before painting and permits a fresh frame retry', async () => {
  const fixture = createIndexedEffectRuntimeFrameFixture();
  captionOwner.prepare.mockRejectedValueOnce(new Error('Caption font is unavailable'));
  await expect(prepareFrameDrivenCompositeFrame(fixture.args)).rejects.toThrow(
    'Caption font is unavailable'
  );
  expect(drawProjectFrameMock).not.toHaveBeenCalled();
  expect(captionOwner.draw).not.toHaveBeenCalled();
  expect(fixture.args.videoEncoder.encode).not.toHaveBeenCalled();
  await prepareFrameDrivenCompositeFrame(fixture.args);
  expect(captionOwner.prepare).toHaveBeenLastCalledWith(
    fixture.project,
    fixture.settings,
    undefined
  );
  expect(captionOwner.assertExportable).toHaveBeenCalledOnce();
  expect(drawProjectFrameMock).toHaveBeenCalledOnce();
  expect(captionOwner.draw).toHaveBeenCalledWith(fixture.context, fixture.args.currentTime);
});

it('paints scene edge presentation after the complete frame and watermark', async () => {
  const fixture = createIndexedEffectRuntimeFrameFixture();
  fixture.project.duration = 10;
  fixture.args.currentTime = 0.5;
  fixture.args.canvas = document.createElement('canvas');
  fixture.args.context = fixture.args.canvas.getContext('2d')!;
  fixture.project.sceneEdges = createVideoProjectSceneEdges();
  fixture.project.sceneEdges.intro = { enabled: true, duration: 1, color: '#ff0000ff' };
  fixture.project.watermark = { ...createQuickEditWatermark('Mark'), mode: 'text' };
  const order: string[] = [];
  fixture.job.watermarkRenderer = {
    prepare: vi.fn(async () => ({
      bounds: { x: 0, y: 0, width: 20, height: 10 },
      draw: () => order.push('watermark'),
    })),
    clear: vi.fn(),
  };
  drawProjectFrameMock.mockImplementation(() => order.push('scene'));
  captionOwner.draw.mockImplementation(() => order.push('captions'));
  vi.spyOn(fixture.args.context, 'fillRect').mockImplementation(() => {
    order.push('scene edge');
  });
  await prepareFrameDrivenCompositeFrame(fixture.args);
  expect(order).toEqual(['scene', 'captions', 'watermark', 'scene edge']);
});
