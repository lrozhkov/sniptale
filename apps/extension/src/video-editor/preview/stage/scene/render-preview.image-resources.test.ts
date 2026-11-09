// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { windowHeaderImageKey } from '../../../../features/video/composition/draw/window-header';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../../features/video/project/factories/clip';
import { VideoProjectAssetType } from '../../../../features/video/project/types';
import { drawPreviewVisualPasses } from './render-visual';
import { renderPreviewScene } from './render-preview';
import type { NativeGpuPreviewRenderer } from './types';
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

it('borrows the prepared geometry and effects without disposing their caller-owned lease', async () => {
  const { job } = setup();
  const { resolveVideoCompositionRenderPasses } =
    await import('../../../../features/video/composition/timeline/render');
  const { resolvePreviewEffectRuntimeRasterScale } = await import('./canvas');
  const passes = resolveVideoCompositionRenderPasses(job.project, job.currentTime);
  const imageOwner = await import('./image-resources');
  const imageResources = imageOwner.capturePreviewImageResources(job, passes);
  const captureImages = vi.spyOn(imageOwner, 'capturePreviewImageResources');
  const timelineOwner = await import('../../../../features/video/composition/timeline/render');
  const resolveAgain = vi.spyOn(timelineOwner, 'resolveVideoCompositionRenderPasses');
  const dispose = vi.fn();
  const effects = {
    kind: 'gpu-scene' as const,
    framesByTime: new Map(),
    overlayFrames: new Map(),
    dispose,
  };
  const cameraOverride = { ...passes.overlayFrame.camera, scale: 1.7 };
  passes.overlayFrame.camera = cameraOverride;
  for (const pass of passes.visualPasses) pass.frame.camera = cameraOverride;
  const prepareImages = vi.fn(async () => undefined);
  const render = vi.fn<NativeGpuPreviewRenderer['render']>(
    async (_input, frame, _finish, _invalidated, supplied) => {
      expect(frame).toBe(passes);
      if (typeof supplied !== 'function') throw new Error('Expected effect resolver.');
      const borrowed = await supplied(async () => {
        throw new Error('Unexpected dependent input.');
      });
      expect(borrowed).toBe(effects);
      return true;
    }
  );
  const presentation = await renderPreviewScene({
    ...job,
    cameraOverride,
    prepareImages,
    gpuPreview: { render, dispose: vi.fn() },
    preparedFrame: {
      passes,
      imageResources,
      effects,
      rasterScale: resolvePreviewEffectRuntimeRasterScale(job),
      compositionTime: job.currentTime,
      sourcePresentation: new Map(),
    },
  });
  expect(presentation).toMatchObject({ camera: cameraOverride, time: job.currentTime });
  expect(prepareImages).not.toHaveBeenCalled();
  expect(captureImages).not.toHaveBeenCalled();
  expect(resolveAgain).not.toHaveBeenCalled();
  captureImages.mockRestore();
  resolveAgain.mockRestore();
  expect(dispose).not.toHaveBeenCalled();
  effects.dispose();
  expect(dispose).toHaveBeenCalledOnce();
});

it.each(['gpu', 'legacy'] as const)(
  'retains the front for a pending required header and reports failed decode in %s serial mode',
  async (previewRenderer) => {
    const { job } = setup();
    const clip = job.project.clips[0]!;
    if (clip.type !== 'VIDEO') throw new Error('Expected video');
    clip.windowHeader = DEFAULT_WINDOW_HEADER;
    const render = vi.fn<NativeGpuPreviewRenderer['render']>(async () => true);
    const notify = vi.fn();
    const input = {
      ...job,
      previewRenderer,
      onImageResourcesPrepared: notify,
      gpuPreview: { render, dispose: vi.fn() },
    };
    await expect(renderPreviewScene(input)).resolves.toBe(false);
    expect(render).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledOnce();
    const image = document.createElement('img');
    Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 0 } });
    await expect(
      renderPreviewScene({
        ...input,
        imageBank: { [windowHeaderImageKey(clip.id, DEFAULT_WINDOW_HEADER)]: image },
      })
    ).rejects.toThrow('Window header image could not be decoded.');
  }
);

it('captures loaded resources once before async GPU work without adding them to presentation metadata', async () => {
  const { job } = setup();
  const clip = job.project.clips[0]!;
  if (clip.type !== 'VIDEO') throw new Error('Expected video');
  clip.windowHeader = DEFAULT_WINDOW_HEADER;
  const key = windowHeaderImageKey(clip.id, DEFAULT_WINDOW_HEADER);
  const image = document.createElement('img');
  Object.defineProperties(image, {
    complete: { value: true },
    naturalWidth: { value: 1280 },
    naturalHeight: { value: 88 },
  });
  const imageBank = { [key]: image, unused: image };
  const notify = vi.fn();
  const render = vi.fn<NativeGpuPreviewRenderer['render']>(async (input) => {
    expect(notify).toHaveBeenCalledOnce();
    expect(input.imageBank).not.toBe(imageBank);
    expect(input.imageBank[key]).toBe(image);
    expect(input.imageBank['unused']).toBeUndefined();
    return true;
  });
  const presented = await renderPreviewScene({
    ...job,
    previewRenderer: 'gpu',
    imageBank,
    onImageResourcesPrepared: notify,
    gpuPreview: { render, dispose: vi.fn() },
  });
  expect(presented).toMatchObject({ time: job.currentTime });
  expect(presented).not.toHaveProperty('imageResources');
  expect(presented).not.toHaveProperty('onImageResourcesPrepared');
  expect(imageBank.unused).toBe(image);
});

it('reuses one image preparation and snapshot notification when GPU rendering falls back to Canvas', async () => {
  const { job } = setup();
  const prepareImages = vi.fn(async (_frames: unknown, _signal?: AbortSignal) => undefined);
  const notify = vi.fn();
  const render = vi.fn<NativeGpuPreviewRenderer['render']>(async () => undefined);
  const controller = new AbortController();
  await renderPreviewScene({
    ...job,
    previewRenderer: 'gpu',
    signal: controller.signal,
    prepareImages,
    onImageResourcesPrepared: notify,
    gpuPreview: { render, dispose: vi.fn() },
  });
  expect(render).toHaveBeenCalledOnce();
  expect(drawPreviewVisualPasses).toHaveBeenCalledOnce();
  expect(prepareImages).toHaveBeenCalledOnce();
  expect(prepareImages.mock.calls[0]?.[1]).toBe(controller.signal);
  expect(notify).toHaveBeenCalledOnce();
});
