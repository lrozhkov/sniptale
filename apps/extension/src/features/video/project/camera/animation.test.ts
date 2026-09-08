import { describe, expect, it } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../factories/creation';
import { createVideoClipFromAsset } from '../factories/clip';
import { VideoProjectAssetType, VideoTrackKind, VideoProjectTrackRole } from '../types';
import { isVideoProjectClip } from '../validation/clips';
import { resolveVideoCompositionVisualLayers } from '../../composition/timeline/frame/layers';
import { resolveCameraClip, canAddCameraPosition } from './animation';
import { editCameraPosition } from './editing';

function fixture() {
  const project = createEmptyVideoProject('Camera');
  const track = createVideoProjectTrack('Camera', 0, VideoTrackKind.PRIMARY);
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
  const clip = createVideoClipFromAsset(track.id, asset, 640, 360, 0);
  if (clip.type !== 'VIDEO') throw new Error('video expected');
  clip.transform = { x: 0, y: 0, width: 640, height: 360, rotation: 0, opacity: 1 };
  clip.cameraPositions = [
    {
      id: 'corner',
      sourceTime: 2,
      fitMode: clip.fitMode,
      transform: { x: 400, y: 200, width: 160, height: 90, rotation: 0, opacity: 1 },
      transition: { kind: 'smooth', duration: 2 },
    },
  ];
  project.tracks = [{ ...track, role: VideoProjectTrackRole.CAMERA }];
  project.clips = [clip];
  project.assets = [asset];
  return { project, clip };
}

describe('camera position trajectory', () => {
  it('starts at the playhead, eases toward the destination and shares geometry with composition', () => {
    const { project, clip } = fixture();
    expect(resolveCameraClip(clip, 2).transform).toEqual(clip.transform);
    expect(resolveCameraClip(clip, 3).transform).toMatchObject({
      x: 200,
      y: 100,
      width: 400,
      height: 225,
    });
    expect(resolveCameraClip(clip, 4).transform).toEqual(clip.cameraPositions![0]!.transform);
    expect(resolveVideoCompositionVisualLayers(project, 3)[0]).toMatchObject({
      x: 200,
      y: 100,
      width: 400,
      height: 225,
      trackRole: 'CAMERA',
    });
  });
  it('preserves phase after splitting in flight, trimming, moving and changing speed', () => {
    const { clip } = fixture();
    const right = {
      ...clip,
      id: 'right',
      sourceStart: 3,
      sourceDuration: 5,
      startTime: 10,
      duration: 5,
    };
    expect(resolveCameraClip(right, 10).transform).toEqual(resolveCameraClip(clip, 3).transform);
    expect(
      resolveCameraClip({ ...right, playbackRate: 2, duration: 2.5 }, 10.25).transform
    ).toEqual(resolveCameraClip(clip, 3.5).transform);
    expect(resolveCameraClip(JSON.parse(JSON.stringify(right)), 10.5).transform).toEqual(
      resolveCameraClip(clip, 3.5).transform
    );
  });
  it('interrupts an ongoing movement continuously when adding another position', () => {
    const { project, clip } = fixture();
    const edited = editCameraPosition(project, clip.id, 3, { kind: 'add' });
    const next = edited.clips[0];
    if (next?.type !== 'VIDEO') throw new Error('video expected');
    expect(resolveCameraClip(next, 3).transform).toEqual(resolveCameraClip(clip, 3).transform);
    expect(resolveCameraClip(next, 3.5).transform).toEqual(resolveCameraClip(clip, 3).transform);
    expect(canAddCameraPosition(edited, clip.id, 3)).toBe(false);
    expect(edited.clips).toHaveLength(1);
    expect(clip.cameraPositions).toHaveLength(1);
  });
  it('supports instant and shrink transitions without a zero-size frame', () => {
    const { clip } = fixture();
    const point = clip.cameraPositions![0]!;
    const shrink = {
      ...clip,
      cameraPositions: [{ ...point, transition: { kind: 'shrink' as const, duration: 2 } }],
    };
    expect(resolveCameraClip(shrink, 3).transform.width).toBeCloseTo(180);
    expect(resolveCameraClip(shrink, 4).transform).toEqual(point.transform);
    const instant = {
      ...clip,
      cameraPositions: [{ ...point, transition: { kind: 'instant' as const, duration: 2 } }],
    };
    expect(resolveCameraClip(instant, 2).transform).toEqual(point.transform);
  });
  it('rejects malformed persisted curves, duplicate times and unbounded geometry', () => {
    const { clip } = fixture();
    expect(isVideoProjectClip(clip)).toBe(true);
    const point = clip.cameraPositions![0]!;
    for (const cameraPositions of [
      [point, { ...point, id: 'duplicate' }],
      [{ ...point, sourceTime: NaN }],
      [{ ...point, transform: { ...point.transform, width: 0 } }],
      [{ ...point, transition: { kind: 'unknown', duration: 1 } }],
      [{ ...point, transition: { kind: { toString: null }, duration: 1 } }],
    ]) {
      expect(isVideoProjectClip({ ...clip, cameraPositions })).toBe(false);
    }
  });
});

it('uses an instant destination on the last visible frame', () => {
  const { project, clip } = fixture();
  const time = clip.startTime + clip.duration - 1 / project.fps;
  const edited = editCameraPosition(project, clip.id, time, { kind: 'add' });
  const camera = edited.clips[0];
  if (camera?.type !== 'VIDEO') throw new Error('video expected');
  expect(camera.cameraPositions?.at(-1)?.transition.kind).toBe('instant');
});
