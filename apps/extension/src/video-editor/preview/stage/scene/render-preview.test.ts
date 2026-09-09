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
  await renderPreviewScene(job);
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
