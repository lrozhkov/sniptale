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
