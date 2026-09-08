import { describe, expect, it } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../../features/video/project/factories/clip';
import { VideoProjectAssetType } from '../../../../features/video/project/types';
import {
  resolveCameraClip,
  updateCameraPositionVisual,
} from '../../../../features/video/project/camera/animation';
import { resolveCameraCanvasTransform } from './camera-transform';

function fixture(kind: 'smooth' | 'shrink') {
  const project = createEmptyVideoProject('Camera');
  const asset = createVideoProjectAsset(
    'Camera',
    VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: 'camera' },
    {
      width: 640,
      height: 360,
      duration: 8,
      mimeType: 'video/mp4',
      size: 10,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  project.tracks[0]!.role = 'CAMERA';
  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 640, 360, 0);
  if (clip.type !== 'VIDEO') throw new Error('video required');
  clip.transform = { x: 0, y: 0, width: 640, height: 360, rotation: 0, opacity: 1 };
  clip.cameraPositions = [
    {
      id: 'corner',
      sourceTime: 2,
      fitMode: clip.fitMode,
      transform: { x: 400, y: 200, width: 160, height: 90, rotation: 20, opacity: 1 },
      transition: { kind, duration: 2 },
    },
  ];
  project.clips = [clip];
  project.assets = [asset];
  return { project, clip };
}

describe('camera canvas edits during a transition', () => {
  it.each(['smooth', 'shrink'] as const)(
    'preserves rendered move and destination size on %s commit',
    (kind) => {
      const { project, clip } = fixture(kind);
      const visual = resolveCameraClip(clip, 3);
      const desired = {
        ...visual.transform,
        x: visual.transform.x + 20,
        y: visual.transform.y + 10,
      };
      const patch = resolveCameraCanvasTransform(project, clip.id, 3, desired)!;
      const committed = updateCameraPositionVisual(clip, 3, { transform: patch });
      expect(committed.cameraPositions![0]!.transform.width).toBeCloseTo(160);
      expect(committed.cameraPositions![0]!.transform.height).toBeCloseTo(90);
      const after = resolveCameraClip(committed, 3).transform;
      for (const key of ['x', 'y', 'width', 'height', 'rotation'] as const)
        expect(after[key]).toBeCloseTo(desired[key]);
      expect(clip.cameraPositions![0]!.transform.x).toBe(400);
    }
  );
  it.each(['smooth', 'shrink'] as const)(
    'preserves a rendered resize and rotation on %s commit',
    (kind) => {
      const { project, clip } = fixture(kind);
      const visual = resolveCameraClip(clip, 3);
      const desired = {
        ...visual.transform,
        width: visual.transform.width + 20,
        height: visual.transform.height + 10,
        rotation: visual.transform.rotation + 5,
      };
      const patch = resolveCameraCanvasTransform(project, clip.id, 3, desired)!;
      const after = resolveCameraClip(
        updateCameraPositionVisual(clip, 3, { transform: patch }),
        3
      ).transform;
      for (const key of ['x', 'y', 'width', 'height', 'rotation'] as const)
        expect(after[key]).toBeCloseTo(desired[key]);
    }
  );
  it('keeps zero-weight and constrained edits finite and within editor limits', () => {
    const { project, clip } = fixture('smooth');
    expect(resolveCameraCanvasTransform(project, clip.id, 2, { x: 500 })).toBeNull();
    const patch = resolveCameraCanvasTransform(project, clip.id, 2.001, { x: 5000, width: 1 })!;
    expect(patch.width).toBeGreaterThanOrEqual(40);
    expect(patch.x).toBeLessThanOrEqual(7680);
    expect(Object.values(patch).every(Number.isFinite)).toBe(true);
  });
});
