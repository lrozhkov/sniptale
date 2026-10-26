// @vitest-environment jsdom
import { createQuickEditWatermark } from '../../../../features/video/project/scene/watermark';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const {
  drawProjectFrameMock,
  disposeEffectRuntimeCompositionMock,
  renderOffscreenProjectEffectFramesMock,
  sendCompositeRenderProgressMock,
  syncClipPlaybackMock,
} = vi.hoisted(() => ({
  drawProjectFrameMock: vi.fn(),
  disposeEffectRuntimeCompositionMock: vi.fn(),
  renderOffscreenProjectEffectFramesMock: vi.fn(),
  sendCompositeRenderProgressMock: vi.fn(),
  syncClipPlaybackMock: vi.fn(),
}));

vi.mock('../../renderer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../renderer')>()),
  drawProjectFrame: drawProjectFrameMock,
}));

vi.mock('../../media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../media')>()),
  syncClipPlayback: syncClipPlaybackMock,
}));

vi.mock('../../effect-runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../effect-runtime')>()),
  renderOffscreenProjectEffectFrames: renderOffscreenProjectEffectFramesMock,
}));

vi.mock('../../../../features/video/composition/effect-runtime', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../features/video/composition/effect-runtime')
  >()),
  disposeEffectRuntimeComposition: disposeEffectRuntimeCompositionMock,
}));

vi.mock('../progress/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../progress/index')>()),
  sendFrameDrivenProgress: vi.fn(),
  sendCompositeRenderProgress: sendCompositeRenderProgressMock,
}));
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  type VideoProjectExportSettings,
} from '../../../../features/video/project/types';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import type { LoadedImagesMap } from '../../renderer';
import type { RenderLoopJobState } from '../shared';
import { renderCompositeFrame } from './frame';

function createProject(duration = 1) {
  return { ...createEmptyVideoProject('Project', 1280, 720), duration };
}

function createSettings(
  format: VideoExportFormat = VideoExportFormat.WEBM,
  fps = 4
): VideoProjectExportSettings {
  const base = {
    width: 1280,
    height: 720,
    fps,
    quality: VideoExportQualityPreset.MEDIUM,
    resolution: 'SOURCE' as const,
    downloadAfterExport: true,
  };
  return format === VideoExportFormat.MP4
    ? { ...base, format, mp4VideoCodec: 'AVC' }
    : { ...base, format, webmVideoCodec: 'VP9' };
}

function createLoadedImages(): LoadedImagesMap {
  return {};
}

function createRenderContext(canvas = document.createElement('canvas')): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Expected test canvas context.');
  }
  return context;
}

function createNonHtmlCanvasContext(): CanvasRenderingContext2D {
  const context = createRenderContext();
  Object.defineProperty(context, 'canvas', { configurable: true, value: {} });
  return context;
}

function createJob(jobId = 'job-1'): RenderLoopJobState {
  return {
    cancelled: false,
    jobId,
    clipMediaElements: new Map<string, HTMLMediaElement>([
      ['clip-1', document.createElement('video')],
    ]),
    clipAudioNodes: new Map(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  renderOffscreenProjectEffectFramesMock.mockResolvedValue(undefined);
  sendCompositeRenderProgressMock.mockResolvedValue(123);
});

it('renders a composite frame and returns the next progress timestamp', async () => {
  const job = createJob();
  const loadedImages = createLoadedImages();
  const nextProgressTimestamp = await renderCompositeFrame({
    context: createNonHtmlCanvasContext(),
    currentTime: 0.25,
    frameIndex: 0,
    job,
    loadedImages,
    lastProgressSent: 0,
    project: createProject(1),
    settings: createSettings(),
    totalFrames: 4,
  });

  expect(syncClipPlaybackMock).toHaveBeenCalledWith(
    expect.objectContaining({ cancelled: false }),
    expect.objectContaining({ duration: 1 }),
    0.25
  );
  expect(drawProjectFrameMock).toHaveBeenCalledTimes(1);
  expect(drawProjectFrameMock).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ duration: 1 }),
    expect.anything(),
    0.25,
    expect.anything(),
    expect.any(Map),
    { spatialRenderer: expect.any(Function) }
  );
  expect(renderOffscreenProjectEffectFramesMock).toHaveBeenCalledWith(
    expect.objectContaining({
      clipMediaElements: job.clipMediaElements,
      loadedImages,
      project: expect.objectContaining({ duration: 1 }),
    })
  );
  expect(sendCompositeRenderProgressMock).toHaveBeenCalledWith({
    currentFrame: 1,
    totalFrames: 4,
    format: VideoExportFormat.WEBM,
    jobId: 'job-1',
    lastProgressSent: 0,
  });
  expect(nextProgressTimestamp).toBe(123);
});

it('renders effect frames through the reusable runtime when one is provided', async () => {
  const canvas = document.createElement('canvas');
  const effectRuntimeFrames = { framesByTime: new Map(), overlayFrames: new Map() };
  const runtime = {
    dispose: vi.fn(),
    renderProjectFrames: vi.fn().mockResolvedValue(effectRuntimeFrames),
  };

  await renderCompositeFrame({
    context: createRenderContext(canvas),
    currentTime: 0.25,
    frameIndex: 0,
    job: createJob(),
    loadedImages: createLoadedImages(),
    lastProgressSent: 0,
    effectRuntime: runtime,
    project: createProject(1),
    settings: createSettings(),
    totalFrames: 4,
  });

  expect(runtime.renderProjectFrames).toHaveBeenCalledWith(
    expect.objectContaining({ ownerDocument: canvas.ownerDocument })
  );
  expect(renderOffscreenProjectEffectFramesMock).not.toHaveBeenCalled();
  expect(drawProjectFrameMock).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.any(Map),
    { effectRuntimeFrames, spatialRenderer: expect.any(Function) }
  );
  expect(disposeEffectRuntimeCompositionMock).toHaveBeenCalledWith(effectRuntimeFrames);
});

it('disposes effect frames when drawing the composite frame fails', async () => {
  const effectRuntimeFrames = { framesByTime: new Map(), overlayFrames: new Map() };
  const runtime = {
    dispose: vi.fn(),
    renderProjectFrames: vi.fn().mockResolvedValue(effectRuntimeFrames),
  };
  drawProjectFrameMock.mockImplementationOnce(() => {
    throw new Error('draw failed');
  });

  await expect(
    renderCompositeFrame({
      context: createRenderContext(),
      currentTime: 0.25,
      frameIndex: 0,
      job: createJob(),
      loadedImages: createLoadedImages(),
      lastProgressSent: 0,
      effectRuntime: runtime,
      project: createProject(1),
      settings: createSettings(),
      totalFrames: 4,
    })
  ).rejects.toThrow('draw failed');

  expect(disposeEffectRuntimeCompositionMock).toHaveBeenCalledWith(effectRuntimeFrames);
  expect(sendCompositeRenderProgressMock).not.toHaveBeenCalled();
});

it('rejects cancelled composite frames before touching playback', async () => {
  await expect(
    renderCompositeFrame({
      context: createRenderContext(),
      currentTime: 0.25,
      frameIndex: 0,
      job: { ...createJob(), cancelled: true },
      loadedImages: createLoadedImages(),
      lastProgressSent: 0,
      project: createProject(1),
      settings: createSettings(),
      totalFrames: 4,
    })
  ).rejects.toThrow('PROJECT_EXPORT_CANCELLED');
  expect(syncClipPlaybackMock).not.toHaveBeenCalled();
  expect(drawProjectFrameMock).not.toHaveBeenCalled();
  expect(sendCompositeRenderProgressMock).not.toHaveBeenCalled();
});

afterEach(() => {
  Reflect.deleteProperty(document, 'fonts');
});

it('burns authored captions after normal composite frames and reuses the prepared layout', async () => {
  const project = createProject(1);
  project.textDocuments = [
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
            text: 'Burned in',
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
  const context = createRenderContext();
  const fillText = vi.spyOn(context, 'fillText');
  const args = {
    context,
    currentTime: 0.25,
    frameIndex: 0,
    job: createJob(),
    loadedImages: createLoadedImages(),
    lastProgressSent: 0,
    project,
    settings: createSettings(),
    totalFrames: 4,
  };
  await renderCompositeFrame(args);
  await renderCompositeFrame({ ...args, currentTime: 0.5, frameIndex: 1 });
  expect(load).toHaveBeenCalledOnce();
  expect(fillText).toHaveBeenCalledWith('Burned in', expect.any(Number), expect.any(Number));
  expect(drawProjectFrameMock.mock.invocationCallOrder[0]).toBeLessThan(
    fillText.mock.invocationCallOrder[0]!
  );
  fillText.mockRestore();
  load.mockResolvedValue([]);
  await expect(renderCompositeFrame({ ...args, job: createJob() })).rejects.toThrow(
    'Caption font is unavailable'
  );
  expect(drawProjectFrameMock).toHaveBeenCalledTimes(2);
  expect(sendCompositeRenderProgressMock).toHaveBeenCalledTimes(2);
});
it('rejects unsafe caption layout before drawing or progress', async () => {
  const assertExportable = vi.fn(() => {
    throw new Error('unsafe captions');
  });
  const draw = vi.fn();
  await expect(
    renderCompositeFrame({
      context: createRenderContext(),
      currentTime: 0.25,
      frameIndex: 0,
      job: {
        ...createJob(),
        captionRenderer: {
          prepare: vi.fn().mockResolvedValue({ assertExportable, draw }),
          clear: vi.fn(),
        },
      },
      loadedImages: {},
      lastProgressSent: 0,
      project: createProject(1),
      settings: createSettings(),
      totalFrames: 4,
    })
  ).rejects.toThrow('unsafe captions');
  expect(assertExportable).toHaveBeenCalledWith({ start: 0, end: 1, duration: 1 });
  expect(drawProjectFrameMock).not.toHaveBeenCalled();
  expect(draw).not.toHaveBeenCalled();
  expect(sendCompositeRenderProgressMock).not.toHaveBeenCalled();
});

it('paints the final watermark after captions and refuses preparation failures before drawing', async () => {
  const project = createProject();
  project.watermark = { ...createQuickEditWatermark('Mark'), mode: 'text' };
  const order: string[] = [];
  const draw = vi.fn(() => {
    order.push('watermark');
  });
  const prepare = vi.fn(async () => ({ bounds: { x: 0, y: 0, width: 20, height: 10 }, draw }));
  const job = createJob();
  job.watermarkRenderer = { prepare, clear: vi.fn() };
  const captionDraw = vi.fn(() => {
    order.push('captions');
  });
  const { createVideoProjectCaptionRenderer } =
    await import('../../../../workflows/video-review/project-captions');
  const captions = await createVideoProjectCaptionRenderer().prepare(project, createSettings());
  job.captionRenderer = {
    prepare: vi.fn(async () => ({ ...captions, draw: captionDraw })),
    clear: vi.fn(),
  };
  drawProjectFrameMock.mockImplementation(() => {
    order.push('scene');
  });
  const args = {
    context: createRenderContext(),
    currentTime: 0,
    frameIndex: 0,
    job,
    loadedImages: createLoadedImages(),
    project,
    settings: createSettings(),
    lastProgressSent: 0,
    totalFrames: 4,
  };
  await renderCompositeFrame(args);
  expect(order).toEqual(['scene', 'captions', 'watermark']);
  expect(prepare).toHaveBeenCalledWith(project, args.settings, undefined);
  prepare.mockRejectedValueOnce(new Error('Logo unavailable'));
  await expect(renderCompositeFrame(args)).rejects.toThrow('Logo unavailable');
  expect(drawProjectFrameMock).toHaveBeenCalledTimes(1);
  expect(draw).toHaveBeenCalledTimes(1);
});
