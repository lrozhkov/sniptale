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

it('projects all rotated selection corners with the same perspective as the scene', () => {
  const project = createEmptyVideoProject();
  project.width = 320;
  project.height = 180;
  const radians = (35 * Math.PI) / 180;
  const camera = {
    ...resolveVideoCompositionFrame(project, 0).camera,
    spatial: {
      reference: { x: 32, y: 18, width: 256, height: 144 },
      rotation: [0, Math.sin(radians / 2), 0, Math.cos(radians / 2)] as const,
      perspective: 1,
      windowMotion: 1,
      lockBackground: false,
      focus: [],
    },
  };
  const stage = document.createElement('div');
  stage.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
  const rect = { x: 180, y: 40, width: 120, height: 100, rotation: 20 };
  const style = getCompositionRectStageStyle(project, rect, camera, false, stage);
  expect(style.transformOrigin).toBe('0 0');
  expect(style.left).toBe('0%');
  expect(style.top).toBe('12.5%');
  expect(style.width).toBe('37.5%');
  expect(style.height).toBe(`${(250 / 600) * 100}%`);
  const m = String(style.transform).slice(9, -1).split(',').map(Number);
  expect(m).toHaveLength(16);
  for (const [x, y] of [
    [0, 0],
    [300, 0],
    [300, 250],
    [0, 250],
  ]) {
    const theta = (rect.rotation * Math.PI) / 180;
    const dx = x! / 2.5 - rect.width / 2,
      dy = y! / 2.5 - rect.height / 2;
    const px = rect.x + rect.width / 2 + Math.cos(theta) * dx - Math.sin(theta) * dy;
    const py = rect.y + rect.height / 2 + Math.sin(theta) * dx + Math.cos(theta) * dy;
    const w = 1 + ((0.7 * Math.sin(radians)) / Math.hypot(256, 144)) * (px - 160);
    const actualW = m[3]! * x! + m[7]! * y! + m[15]!;
    expect((m[0]! * x! + m[4]! * y! + m[12]!) / actualW).toBeCloseTo(
      (160 + (Math.cos(radians) * (px - 160)) / w) * 2.5,
      9
    );
    expect((m[1]! * x! + m[5]! * y! + m[13]!) / actualW).toBeCloseTo((90 + (py - 90) / w) * 2.5, 9);
  }
});
