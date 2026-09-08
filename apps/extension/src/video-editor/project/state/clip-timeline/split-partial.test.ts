import { expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../../features/video/project/factories/clip';
import {
  VideoProjectAssetType,
  VideoProjectClipType,
  VideoTrackKind,
} from '../../../../features/video/project/types';
import { canSplitProjectClipAtTime } from '../../../../features/video/project/timeline/split-eligibility';
import { splitProjectClipsAtTimeWithResult } from './split';
import { moveProjectClip } from './mutations';
import { createVideoEditorProjectActions } from '../actions';
import type { VideoEditorProjectState } from '../contracts';
import { resetVideoEditorProjectHistory, undoVideoEditorProjectHistory } from '../../history';

function setup(cameraStart: number, cameraDuration: number) {
  const project = createEmptyVideoProject('Partial camera');
  const cameraTrack = createVideoProjectTrack('Camera', -1, VideoTrackKind.PRIMARY);
  project.tracks.push(cameraTrack);
  const asset = createVideoProjectAsset(
    'Recording',
    VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: 'source' },
    {
      width: 1280,
      height: 720,
      duration: 12,
      mimeType: 'video/webm',
      size: 100,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  const screen = createVideoClipFromAsset(project.tracks[0]!.id, asset, 1280, 720, 0, {
    groupId: 'take',
  });
  const camera = createVideoClipFromAsset(cameraTrack.id, asset, 1280, 720, cameraStart, {
    groupId: 'take',
  });
  if (camera.type !== VideoProjectClipType.VIDEO) throw new Error('Expected video fixture');
  camera.duration = cameraDuration;
  camera.playbackRate = 2;
  camera.sourceStart = 1;
  camera.sourceDuration = cameraDuration * 2;
  project.assets = [asset];
  project.clips = [screen, camera];
  return { project, screen, camera, cameraTrack };
}

it.each([
  { start: 7, duration: 3 },
  { start: 6, duration: 3 },
])(
  'keeps a later camera intact and links it to the trailing screen: $start',
  ({ start, duration }) => {
    const { project, screen, camera } = setup(start, duration);
    expect(canSplitProjectClipAtTime(project, screen.id, 6)).toBe(true);
    const result = splitProjectClipsAtTimeWithResult(project, screen.id, 6)!;
    const trailing = result.project.clips.find(({ id }) => id === result.trailingClipId)!;
    expect(result.project.clips).toHaveLength(3);
    expect(trailing.groupId).not.toBe('take');
    expect(result.project.clips.find(({ id }) => id === camera.id)).toEqual({
      ...camera,
      groupId: trailing.groupId,
    });
    const moved = moveProjectClip(result.project, trailing.id, 10);
    expect(moved.clips.find(({ id }) => id === camera.id)?.startTime).toBe(start + 4);
    expect(moved.clips.find(({ id }) => id === screen.id)?.startTime).toBe(0);
  }
);

it.each([
  { start: 1, duration: 3 },
  { start: 3, duration: 3 },
])('keeps a finished camera on the leading side: $start', ({ start, duration }) => {
  const { project, screen, camera } = setup(start, duration);
  const result = splitProjectClipsAtTimeWithResult(project, screen.id, 6)!;
  expect(result).not.toBeNull();
  expect(result.project.clips).toHaveLength(3);
  expect(result.project.clips.find(({ id }) => id === camera.id)).toEqual(camera);
  const moved = moveProjectClip(result.project, result.trailingClipId, 10);
  expect(moved.clips.find(({ id }) => id === camera.id)).toEqual(camera);
});

it('splits the camera intersection with rate-adjusted source offsets', () => {
  const { project, screen, camera } = setup(4, 5);
  const result = splitProjectClipsAtTimeWithResult(project, screen.id, 6)!;
  expect(result.project.clips).toHaveLength(4);
  expect(result.project.clips.find(({ id }) => id === camera.id)).toMatchObject({
    startTime: 4,
    duration: 2,
    sourceStart: 1,
    sourceDuration: 4,
  });
  const trailing = result.project.clips.find(({ id }) => id === result.trailingClipId)!;
  expect(
    result.project.clips.find((clip) => clip.trackId === camera.trackId && clip.id !== camera.id)
  ).toMatchObject({
    startTime: 6,
    duration: 3,
    sourceStart: 5,
    sourceDuration: 6,
    groupId: trailing.groupId,
  });
});

it('refuses tiny crossing fragments, a non-interior selected clip and locked counterparts', () => {
  const { project, screen, camera, cameraTrack } = setup(5.98, 3);
  expect(splitProjectClipsAtTimeWithResult(project, screen.id, 6)).toBeNull();
  camera.startTime = 7;
  expect(splitProjectClipsAtTimeWithResult(project, camera.id, 6)).toBeNull();
  cameraTrack.locked = true;
  expect(splitProjectClipsAtTimeWithResult(project, screen.id, 6)).toBeNull();
  expect(project.clips).toEqual([screen, camera]);
});

it('commits the partial group through the editor action and restores it with one undo', () => {
  const { project, screen, camera } = setup(7, 3);
  const store = createStore<VideoEditorProjectState>()((set, get) => ({
    project,
    currentTime: 6,
    placementMode: null,
    selection: { kind: 'clip', clipId: screen.id },
    selectedTrackId: screen.trackId,
    projectHistory: resetVideoEditorProjectHistory(project.id),
    ...createVideoEditorProjectActions(set, get),
  }));
  store.getState().splitClipAt(screen.id, 6);
  const state = store.getState();
  expect(state.projectHistory.past).toHaveLength(1);
  const selectedId = state.selection.kind === 'clip' ? state.selection.clipId : null;
  const selected = state.project!.clips.find(({ id }) => id === selectedId)!;
  expect(selected).toMatchObject({ startTime: 6, duration: 6 });
  expect(state.project!.clips.find(({ id }) => id === camera.id)?.groupId).toBe(selected.groupId);
  const undone = undoVideoEditorProjectHistory(state.projectHistory, state.project!);
  expect(undone?.status).toBe('applied');
  if (undone?.status === 'applied') {
    expect(undone.project.clips).toEqual(project.clips);
    expect(undone.project.assets).toEqual(project.assets);
  }
});
