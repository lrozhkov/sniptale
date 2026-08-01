// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

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
    {}
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
    { effectRuntimeFrames }
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
