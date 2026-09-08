// @vitest-environment jsdom
import { expect, it } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../../features/video/project/factories/clip';
import {
  VideoProjectAssetType,
  VideoProjectTrackRole,
  VideoMotionOverlayZoomMode,
} from '../../../../features/video/project/types';
import { resolveVideoCompositionFrame } from '../../../../features/video/composition/timeline/frame';
import {
  shouldLockPreviewClipToViewport,
  getPreviewStageInteractionScale,
  getCompositionRectStageStyle,
} from './geometry';

it('uses viewport selection bounds and pointer scale for camera clips under screen zoom', () => {
  const project = createEmptyVideoProject();
  project.width = 1280;
  project.height = 720;
  project.tracks[0]!.role = VideoProjectTrackRole.CAMERA;
  const asset = createVideoProjectAsset(
    'Camera',
    VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: 'camera' },
    {
      width: 640,
      height: 360,
      duration: 4,
      mimeType: 'video/webm',
      size: 100,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  const clip = createVideoClipFromAsset(
    project.tracks[0]!.id,
    asset,
    project.width,
    project.height,
    0
  );
  clip.transform = { ...clip.transform, x: 960, y: 540, width: 256, height: 144 };
  project.assets = [asset];
  project.clips = [clip];
  const camera = {
    ...resolveVideoCompositionFrame(project, 1).camera,
    scale: 2,
    overlayZoomMode: VideoMotionOverlayZoomMode.FOLLOW_CAMERA,
  };
  const stage = document.createElement('div');
  stage.getBoundingClientRect = () => new DOMRect(0, 0, 1280, 720);
  const locked = shouldLockPreviewClipToViewport(clip, camera, project);
  expect(locked).toBe(true);
  expect(getPreviewStageInteractionScale(stage, project, camera, locked)).toEqual({
    scaleX: 1,
    scaleY: 1,
  });
  expect(getCompositionRectStageStyle(project, clip.transform, camera, locked, stage)).toEqual({
    left: '75%',
    top: '75%',
    width: '20%',
    height: '20%',
  });
  delete project.tracks[0]!.role;
  expect(shouldLockPreviewClipToViewport(clip, camera, project)).toBe(false);
});
