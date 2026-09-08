import { expect, it } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../../features/video/project/factories/clip';
import {
  VideoClipLinkMode,
  VideoProjectAssetType,
  VideoProjectTrackRole,
  VideoTrackKind,
} from '../../../../features/video/project/types';
import { planClipSwap, swapProjectClips } from './reorder';

function fixture() {
  const project = createEmptyVideoProject('Order');
  const camera = createVideoProjectTrack('Camera', -1, VideoTrackKind.PRIMARY);
  camera.role = VideoProjectTrackRole.CAMERA;
  project.tracks.push(camera);
  const asset = createVideoProjectAsset(
    'Source',
    VideoProjectAssetType.VIDEO,
    { kind: 'recording', recordingId: 'rec' },
    {
      width: 1280,
      height: 720,
      duration: 30,
      size: 1,
      mimeType: 'video/webm',
      hasAudio: false,
      audioPeaks: null,
    }
  );
  project.assets = [asset];
  const clip = (id: string, start: number, duration: number, trackId: string, groupId: string) => ({
    ...createVideoClipFromAsset(trackId, asset, 1280, 720, start, { groupId }),
    id,
    name: id,
    duration,
    sourceDuration: duration,
    sourceStart: id.startsWith('B') ? 12 : 2,
    linkMode: VideoClipLinkMode.LINKED,
  });
  project.clips = [
    clip('A', 0, 4, project.tracks[0]!.id, 'a'),
    clip('Acam', 1, 2, camera.id, 'a'),
    clip('B', 6, 3, project.tracks[0]!.id, 'b'),
    clip('Bcam', 6.5, 1, camera.id, 'b'),
  ];
  return project;
}

it('swaps unequal groups and preserves the gap, source ranges and relative sidecar offsets both ways', () => {
  const before = fixture();
  const after = swapProjectClips(before, 'A', 'right');
  expect(after.clips.map((clip) => [clip.id, clip.startTime])).toEqual([
    ['A', 5],
    ['Acam', 6],
    ['B', 0],
    ['Bcam', 0.5],
  ]);
  for (const old of before.clips)
    expect(after.clips.find((clip) => clip.id === old.id)).toEqual({
      ...old,
      startTime: after.clips.find((clip) => clip.id === old.id)!.startTime,
    });
  expect(swapProjectClips(after, 'A', 'left').clips).toEqual(before.clips);
});

it('uses the main picture as ordering reference when a linked camera is selected', () => {
  const before = fixture();
  expect(swapProjectClips(before, 'Acam', 'right').clips).toEqual(
    swapProjectClips(before, 'A', 'right').clips
  );
});

it('uses the primary recording picture after it moves to a non-root track without a neighboring camera', () => {
  const before = fixture();
  before.assets[0]!.recordingPart = { recordingId: 'rec', role: 'primary' };
  before.assets.push({
    ...before.assets[0]!,
    id: 'camera-asset',
    recordingPart: { recordingId: 'rec', role: 'camera' },
  });
  const track = createVideoProjectTrack('Other picture', 2, VideoTrackKind.PRIMARY);
  before.tracks.push(track);
  before.clips = before.clips
    .filter((clip) => clip.id !== 'Bcam')
    .map((clip) =>
      clip.id === 'Acam' ? { ...clip, assetId: 'camera-asset' } : { ...clip, trackId: track.id }
    );
  expect(planClipSwap(before, 'A', 'right').status).toBe('ready');
  expect(swapProjectClips(before, 'Acam', 'right').clips).toEqual(
    swapProjectClips(before, 'A', 'right').clips
  );
  before.clips = before.clips.map((clip) =>
    clip.id === 'Acam' ? { ...clip, trackId: before.tracks[0]!.id } : clip
  );
  expect(planClipSwap(before, 'Acam', 'right').status).toBe('ready');
  expect(swapProjectClips(before, 'Acam', 'right').clips).toEqual(
    swapProjectClips(before, 'A', 'right').clips
  );
});

it('keeps a detached camera stationary when its former recording group is reordered', () => {
  const before = fixture();
  before.clips[1] = { ...before.clips[1]!, linkMode: VideoClipLinkMode.DETACHED, startTime: 4 };
  const after = swapProjectClips(before, 'A', 'right');
  expect(after).not.toBe(before);
  expect(after.clips[1]).toBe(before.clips[1]);
  expect(after.clips[0]?.startTime).toBe(5);
});

it('leaves independent overlapping layers and different logical lanes unchanged', () => {
  const before = fixture();
  const overlay = {
    ...before.clips[0]!,
    id: 'independent',
    groupId: null,
    linkMode: VideoClipLinkMode.DETACHED,
    timelineLaneId: 'line-2',
    duration: 20,
  };
  before.clips.push(overlay);
  const after = swapProjectClips(before, 'A', 'right');
  expect(after).not.toBe(before);
  expect(after.clips.find((clip) => clip.id === overlay.id)).toBe(overlay);
});

it('rejects a collision on a linked companion track without a partial move', () => {
  const before = fixture();
  before.clips.push({
    ...before.clips[1]!,
    id: 'unrelated-camera',
    startTime: 5.5,
    duration: 0.75,
    groupId: null,
    linkMode: VideoClipLinkMode.DETACHED,
  });
  expect(planClipSwap(before, 'A', 'right')).toEqual({
    status: 'unavailable',
    reason: 'collision',
  });
  expect(swapProjectClips(before, 'A', 'right')).toBe(before);
});

it('rejects overlap, absent neighbors and locks across either complete group', () => {
  const before = fixture();
  expect(swapProjectClips(before, 'A', 'left')).toBe(before);
  expect(swapProjectClips(before, 'missing', 'right')).toBe(before);
  const locked = {
    ...before,
    tracks: before.tracks.map((track) => ({
      ...track,
      locked: track.role === VideoProjectTrackRole.CAMERA,
    })),
  };
  expect(planClipSwap(locked, 'A', 'right')).toEqual({ status: 'unavailable', reason: 'locked' });
  const overlap = {
    ...before,
    clips: before.clips.map((clip) => (clip.id === 'B' ? { ...clip, startTime: 2 } : clip)),
  };
  expect(planClipSwap(overlap, 'A', 'right')).toEqual({ status: 'unavailable', reason: 'overlap' });
});

it('keeps a clip effect document phase when its preroll moves before project zero', () => {
  const before = fixture();
  before.effectInstances = [
    {
      id: 'fx',
      kind: 'targetEffect',
      snapshotId: 'snapshot',
      enabled: true,
      target: { kind: 'clip', clipId: 'B' },
      startTime: 4,
      duration: 5,
      playbackRate: 2,
      sourceStart: 3,
      controls: {},
    },
  ];
  const after = swapProjectClips(before, 'B', 'left');
  expect(after.effectInstances?.[0]).toMatchObject({
    startTime: 0,
    duration: 3,
    playbackRate: 2,
    sourceStart: 7,
  });
});
