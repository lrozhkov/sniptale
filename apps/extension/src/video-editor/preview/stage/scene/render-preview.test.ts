import { createQuickEditWatermark } from '../../../../features/video/project/scene/watermark';
// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../../features/video/project/factories/clip';
import { VideoProjectAssetType } from '../../../../features/video/project/types';
import { drawPreviewVisualPasses } from './render-visual';
import { renderPreviewScene } from './render-preview';
vi.mock('./render-visual', () => ({ drawPreviewVisualPasses: vi.fn(() => null) }));
beforeEach(() => vi.clearAllMocks());
function setup() {
  const project = createEmptyVideoProject();
  const asset = createVideoProjectAsset(
    'Video',
    VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: 'video' },
    {
      width: 1280,
      height: 720,
      duration: 5,
      mimeType: 'video/webm',
      size: 10,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  project.assets = [asset];
  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 1280, 720, 0);
  project.clips = [clip];
  const video = document.createElement('video');
  Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
  return {
    video,
    job: {
      project,
      canvas: document.createElement('canvas'),
      currentTime: 1,
      imageBank: {},
      stage: null,
      videoRefs: { current: { [clip.id]: video } },
    },
  };
}
it('retains the presented canvas when a seek loses video readiness between enqueue and drawing', async () => {
  const { video, job } = setup();
  const pending = renderPreviewScene(job);
  Object.defineProperty(video, 'readyState', { value: 1, configurable: true });
  expect(await pending).toBe(false);
  expect(drawPreviewVisualPasses).not.toHaveBeenCalled();
  Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
  expect(await renderPreviewScene(job)).toBe(false);
  expect(drawPreviewVisualPasses).toHaveBeenCalledOnce();
});
it('still paints scene backgrounds in timeline gaps', async () => {
  const { video, job } = setup();
  Object.defineProperty(video, 'readyState', { value: 1 });
  await renderPreviewScene({ ...job, currentTime: 6 });
  expect(drawPreviewVisualPasses).toHaveBeenCalledOnce();
});

it('renders inspector framing through the shared camera transform instead of scaling a flattened bitmap', async () => {
  const { job } = setup();
  const cameraOverride = {
    focusPoint: { x: 640, y: 360 },
    scale: 0.5,
    viewportX: -640,
    viewportY: -360,
    viewportWidth: 2560,
    viewportHeight: 1440,
    regionId: 'selected',
    motionBlurAmount: 0,
    overlayZoomMode: 'LOCK_OVERLAYS' as const,
  };
  await renderPreviewScene({ ...job, ...{ cameraOverride } });
  const args = vi.mocked(drawPreviewVisualPasses).mock.calls[0]![0];
  expect(args.overlayFrame.camera).toEqual(cameraOverride);
  expect(args.passes.every((pass) => pass.frame.camera === cameraOverride)).toBe(true);
});

it('does not start a frame from unavailable media even when it becomes ready during async work', async () => {
  const { video, job } = setup();
  Object.defineProperty(video, 'readyState', { value: 1, configurable: true });
  const pending = renderPreviewScene(job);
  Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
  expect(await pending).toBe(false);
  expect(drawPreviewVisualPasses).not.toHaveBeenCalled();
  await renderPreviewScene(job);
  expect(drawPreviewVisualPasses).toHaveBeenCalledOnce();
});

it('retains the complete frame while a video is seeking despite current-data readiness', async () => {
  const { video, job } = setup();
  Object.defineProperty(video, 'seeking', { value: true, configurable: true });
  expect(await renderPreviewScene(job)).toBe(false);
  expect(drawPreviewVisualPasses).not.toHaveBeenCalled();
  Object.defineProperty(video, 'seeking', { value: false });
  await renderPreviewScene(job);
  expect(drawPreviewVisualPasses).toHaveBeenCalledOnce();
});

it('discards async results if seeking starts and finishes during their calculation', async () => {
  const { video, job } = setup();
  const pending = renderPreviewScene(job);
  video.dispatchEvent(new Event('seeking'));
  video.dispatchEvent(new Event('seeked'));
  expect(await pending).toBe(false);
  expect(drawPreviewVisualPasses).not.toHaveBeenCalled();
  await renderPreviewScene(job);
  expect(drawPreviewVisualPasses).toHaveBeenCalledOnce();
});

it('draws prepared captions after the scene in final viewport coordinates regardless of camera zoom', async () => {
  const { job } = setup();
  const context = job.canvas.getContext('2d')!;
  const fillText = vi.spyOn(context, 'fillText');
  const translate = vi.spyOn(context, 'translate');
  const scale = vi.spyOn(context, 'scale');
  vi.mocked(drawPreviewVisualPasses).mockReturnValueOnce({
    context,
    viewport: { offsetX: 12, offsetY: 18, scale: 0.5, width: 960, height: 540 },
  } as ReturnType<typeof drawPreviewVisualPasses>);
  const draw = vi.fn((target: CanvasRenderingContext2D, time: number) => {
    target.fillText(`Caption ${time}`, 100, 200);
  });
  const captionRenderer = {
    prepare: vi.fn().mockResolvedValue({ plan: { cues: [{}] }, draw }),
    clear: vi.fn(),
  };
  await renderPreviewScene({ ...job, captionRenderer });
  expect(captionRenderer.prepare).toHaveBeenCalledWith(job.project, job.project, undefined);
  expect(translate).toHaveBeenCalledWith(12, 18);
  expect(scale).toHaveBeenCalledWith(0.5, 0.5);
  expect(fillText).toHaveBeenCalledWith('Caption 1', 100, 200);
  expect(vi.mocked(drawPreviewVisualPasses).mock.invocationCallOrder[0]).toBeLessThan(
    draw.mock.invocationCallOrder[0]!
  );
});
it('keeps the presented scene when caption preparation fails or completes after cancellation', async () => {
  const { job } = setup();
  const captionRenderer = {
    prepare: vi.fn().mockRejectedValue(new Error('font unavailable')),
    clear: vi.fn(),
  };
  await expect(renderPreviewScene({ ...job, captionRenderer })).rejects.toThrow('font unavailable');
  expect(drawPreviewVisualPasses).not.toHaveBeenCalled();
  let ready!: () => void;
  const gate = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const draw = vi.fn();
  captionRenderer.prepare.mockImplementation(async () => {
    await gate;
    return { plan: { cues: [{}] }, draw };
  });
  const controller = new AbortController();
  const pending = renderPreviewScene({ ...job, captionRenderer, signal: controller.signal });
  controller.abort();
  ready();
  await pending;
  expect(drawPreviewVisualPasses).not.toHaveBeenCalled();
  expect(draw).not.toHaveBeenCalled();
});

it('preserves the last complete spatial frame through paint failure cancellation resize and retry', async () => {
  const { job } = setup();
  const { createDefaultCameraState } =
    await import('../../../../features/video/composition/motion/defaults');
  const staging = document.createElement('canvas');
  job.canvas.width = 320;
  job.canvas.height = 180;
  const presented = job.canvas.getContext('2d')!;
  const publish = vi.spyOn(presented, 'drawImage');
  const cameraOverride = {
    ...createDefaultCameraState(job.project),
    spatial: {
      rotation: [0, 0, 0, 1] as const,
      perspective: 0,
      windowMotion: 0,
      lockBackground: false,
      focus: [],
      reference: { x: 0, y: 0, width: 1280, height: 720 },
    },
  };
  const input = { ...job, cameraOverride, stagingCanvas: () => staging };
  const paint = (canvas: HTMLCanvasElement, width = 640, height = 360) => {
    canvas.width = width;
    canvas.height = height;
    return {
      context: canvas.getContext('2d')!,
      bounds: { width, height },
      dpr: 1,
      viewport: { width, height, offsetX: 0, offsetY: 0, scale: 0.5 },
    };
  };
  vi.mocked(drawPreviewVisualPasses).mockImplementationOnce(({ canvas }) => {
    paint(canvas);
    throw new Error('projection failed');
  });
  await expect(renderPreviewScene(input)).rejects.toThrow('projection failed');
  expect(job.canvas.width).toBe(320);
  expect(job.canvas.height).toBe(180);
  expect(publish).not.toHaveBeenCalled();
  const controller = new AbortController();
  vi.mocked(drawPreviewVisualPasses).mockImplementationOnce(({ canvas }) => {
    const result = paint(canvas);
    controller.abort();
    return result;
  });
  expect(await renderPreviewScene({ ...input, signal: controller.signal })).toBe(false);
  expect(publish).not.toHaveBeenCalled();
  expect(job.canvas.width).toBe(320);
  vi.mocked(drawPreviewVisualPasses).mockImplementationOnce(({ canvas, viewportCanvas }) => {
    expect(canvas).toBe(staging);
    expect(viewportCanvas).toBe(job.canvas);
    return paint(canvas);
  });
  await renderPreviewScene(input);
  expect(job.canvas.width).toBe(640);
  expect(job.canvas.height).toBe(360);
  expect(publish).toHaveBeenCalledOnce();
  expect(publish).toHaveBeenCalledWith(staging, 0, 0);
  vi.mocked(drawPreviewVisualPasses).mockImplementationOnce(({ canvas }) => {
    paint(canvas, 1920, 1080);
    throw new Error('resized GPU failed');
  });
  await expect(renderPreviewScene(input)).rejects.toThrow('resized GPU failed');
  expect(job.canvas.width).toBe(640);
  expect(job.canvas.height).toBe(360);
  expect(publish).toHaveBeenCalledOnce();
  vi.mocked(drawPreviewVisualPasses).mockImplementationOnce(({ canvas }) =>
    paint(canvas, 1920, 1080)
  );
  await renderPreviewScene(input);
  expect(job.canvas.width).toBe(1920);
  expect(job.canvas.height).toBe(1080);
  expect(publish).toHaveBeenCalledTimes(2);
});

it('avoids staging for plain frames and releases temporary spatial canvas after failure', async () => {
  const { job } = setup();
  const stagingCanvas = vi.fn(() => document.createElement('canvas'));
  await renderPreviewScene({ ...job, stagingCanvas });
  expect(stagingCanvas).not.toHaveBeenCalled();
  const { createDefaultCameraState } =
    await import('../../../../features/video/composition/motion/defaults');
  const cameraOverride = {
    ...createDefaultCameraState(job.project),
    spatial: {
      rotation: [0, 0, 0, 1] as const,
      perspective: 0,
      windowMotion: 0,
      lockBackground: false,
      focus: [],
      reference: { x: 0, y: 0, width: 1280, height: 720 },
    },
  };
  const observed: HTMLCanvasElement[] = [];
  vi.mocked(drawPreviewVisualPasses).mockImplementationOnce(({ canvas }) => {
    observed.push(canvas);
    canvas.width = 960;
    canvas.height = 540;
    throw new Error('temporary frame failed');
  });
  await expect(renderPreviewScene({ ...job, cameraOverride })).rejects.toThrow(
    'temporary frame failed'
  );
  expect(observed[0]).not.toBe(job.canvas);
  expect(observed[0]!.width).toBe(0);
  expect(observed[0]!.height).toBe(0);
});

it('retains the complete live frame when sharp overlays fail after successful spatial media painting', async () => {
  const { job } = setup();
  job.project.duration = 5;
  job.project.actionEvents = [
    {
      id: 'manual',
      kind: 'CLICK',
      anchor: { kind: 'project', time: 0.8 },
      point: { x: 100, y: 80 },
      label: 'Click',
      data: {},
    },
  ];
  const { createDefaultCameraState } =
    await import('../../../../features/video/composition/motion/defaults');
  const cameraOverride = {
    ...createDefaultCameraState(job.project),
    spatial: {
      rotation: [0, 0, 0, 1] as const,
      perspective: 1,
      windowMotion: 1,
      lockBackground: false,
      focus: [],
      reference: { x: 0, y: 0, width: 1280, height: 720 },
    },
  };
  job.canvas.width = 320;
  job.canvas.height = 180;
  const presented = job.canvas.getContext('2d')!;
  presented.fillStyle = '#22d3ee';
  presented.fillRect(0, 0, 320, 180);
  const publish = vi.spyOn(presented, 'drawImage');
  vi.mocked(drawPreviewVisualPasses).mockImplementationOnce(({ canvas }) => {
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, 640, 360);
    return {
      context,
      bounds: { width: 640, height: 360 },
      dpr: 1,
      viewport: { width: 640, height: 360, offsetX: 0, offsetY: 0, scale: 0.5 },
    };
  });
  const spatialRenderer = vi.fn(() => {
    throw new Error('sharp GPU failed');
  });
  await expect(renderPreviewScene({ ...job, cameraOverride, spatialRenderer })).rejects.toThrow(
    'sharp GPU failed'
  );
  expect(spatialRenderer).toHaveBeenCalledOnce();
  expect(job.canvas.width).toBe(320);
  expect(job.canvas.height).toBe(180);
  expect(publish).not.toHaveBeenCalled();
  expect(Array.from(presented.getImageData(20, 20, 1, 1).data)).toEqual([34, 211, 238, 255]);
});

it('paints watermark without captions and publishes only a completed overlay frame', async () => {
  const { job } = setup();
  job.project.watermark = { ...createQuickEditWatermark('Mark'), mode: 'text' };
  const draw = vi.fn();
  const prepare = vi.fn(async () => ({ bounds: { x: 0, y: 0, width: 20, height: 10 }, draw }));
  const watermarkRenderer = { prepare, clear: vi.fn() };
  const observed: HTMLCanvasElement[] = [];
  vi.mocked(drawPreviewVisualPasses).mockImplementation(({ canvas }) => {
    observed.push(canvas);
    canvas.width = 640;
    canvas.height = 360;
    return {
      context: canvas.getContext('2d')!,
      bounds: { width: 640, height: 360 },
      dpr: 1,
      viewport: { width: 640, height: 360, offsetX: 0, offsetY: 0, scale: 0.5 },
    };
  });
  const presented = job.canvas.getContext('2d')!;
  const publish = vi.spyOn(presented, 'drawImage');
  await renderPreviewScene({ ...job, watermarkRenderer });
  expect(draw).toHaveBeenCalledTimes(1);
  expect(observed[0]).not.toBe(job.canvas);
  expect(publish).toHaveBeenCalledTimes(1);
  expect(prepare).toHaveBeenCalledWith(job.project, job.project, undefined);
  draw.mockImplementationOnce(() => {
    throw new Error('Overlay failed');
  });
  await expect(renderPreviewScene({ ...job, watermarkRenderer })).rejects.toThrow('Overlay failed');
  expect(publish).toHaveBeenCalledTimes(1);
  await renderPreviewScene({ ...job, watermarkRenderer });
  expect(publish).toHaveBeenCalledTimes(2);
  prepare.mockRejectedValueOnce(new Error('Logo unavailable'));
  await expect(renderPreviewScene({ ...job, watermarkRenderer })).rejects.toThrow(
    'Logo unavailable'
  );
  expect(publish).toHaveBeenCalledTimes(2);
  expect(watermarkRenderer.clear).not.toHaveBeenCalled();
  job.project.watermark.mode = 'none';
  await renderPreviewScene({ ...job, watermarkRenderer });
  expect(watermarkRenderer.clear).toHaveBeenCalledTimes(1);
});

it('paints borrowed decoded cut frames while the unused live video is seeking', async () => {
  const { video, job } = setup();
  Object.defineProperty(video, 'seeking', { value: true });
  Object.defineProperty(video, 'readyState', { value: 1 });
  const source = { sourceWidth: 1280, sourceHeight: 720, draw: vi.fn() };
  const clipId = job.project.clips[0]!.id;
  const decodedVideoFrames = new Map([[clipId, source]]);
  await renderPreviewScene({ ...job, decodedVideoFrames });
  expect(drawPreviewVisualPasses).toHaveBeenCalledOnce();
  expect(vi.mocked(drawPreviewVisualPasses).mock.calls[0]![0].clipMediaElements.get(clipId)).toBe(
    source
  );
});

it('prepares the global watermark when passive experimental metadata names a hidden source', async () => {
  const { job } = setup();
  const source = job.project.clips[0]!;
  if (source.type !== 'VIDEO') throw new Error('Missing video');
  job.project.watermark = { ...createQuickEditWatermark('Mark'), mode: 'text' };
  job.project.watermarkSource = {
    assetId: source.assetId,
    sourceInstanceId: source.sourceInstanceId ?? source.id,
  };
  job.project.tracks[0]!.visible = false;
  const watermarkRenderer = { prepare: vi.fn(), clear: vi.fn() };
  await renderPreviewScene({ ...job, watermarkRenderer });
  expect(watermarkRenderer.prepare).toHaveBeenCalledExactlyOnceWith(
    job.project,
    job.project,
    undefined
  );
  expect(watermarkRenderer.clear).not.toHaveBeenCalled();
});

it.each([24, 60])(
  'paints ordinary estimate fades at output %s fps for a 30 fps project',
  async (sampleFps) => {
    const { job } = setup();
    job.project.fps = 30;
    job.project.duration = 1;
    job.project.sceneEdges = {
      intro: { enabled: false, duration: 0.4 },
      outro: { enabled: true, duration: 0.4, color: '#000000' },
    };
    vi.mocked(drawPreviewVisualPasses).mockImplementation(({ canvas }) => {
      canvas.width = 8;
      canvas.height = 4;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, 8, 4);
      return {
        context,
        bounds: { width: 8, height: 4 },
        dpr: 1,
        viewport: { width: 8, height: 4, offsetX: 0, offsetY: 0, scale: 1 },
      };
    });
    await renderPreviewScene({
      ...job,
      ...{ sampleFps },
      currentTime: (sampleFps - 2) / sampleFps,
    });
    const expected = sampleFps === 24 ? 27 : 11;
    const preceding = job.canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data;
    for (const channel of preceding.slice(0, 3))
      expect(Math.abs(channel - expected)).toBeLessThanOrEqual(1);
    await renderPreviewScene({
      ...job,
      ...{ sampleFps },
      currentTime: (sampleFps - 1) / sampleFps,
    });
    expect(Array.from(job.canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data)).toEqual([
      0, 0, 0, 255,
    ]);
  }
);
