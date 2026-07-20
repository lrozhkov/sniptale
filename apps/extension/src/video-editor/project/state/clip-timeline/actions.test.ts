import { expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../../features/video/project/factories/creation';
import {
  VideoClipLinkMode,
  VideoProjectAssetType,
  VideoProjectClipType,
} from '../../../../features/video/project/types';
import { createVideoEditorProjectClipTimelineActions } from './actions';
import type { VideoEditorProjectState } from '../contracts';

function createMutableState() {
  let state = {
    currentTime: 0,
    project: createEmptyVideoProject('Timeline actions'),
    selectedClipId: null,
    selectedTrackId: null,
    selection: { kind: 'scene' },
  } as VideoEditorProjectState;
  const set = (
    updater:
      | Partial<VideoEditorProjectState>
      | ((state: VideoEditorProjectState) => Partial<VideoEditorProjectState>)
  ) => {
    const nextPatch = typeof updater === 'function' ? updater(state) : updater;
    state = { ...state, ...nextPatch };
  };

  return {
    getState: () => state,
    set,
  };
}

function createVideoAsset() {
  return createVideoProjectAsset(
    'clip-video',
    VideoProjectAssetType.VIDEO,
    {
      kind: 'project-asset',
      projectAssetId: 'clip-video-asset',
    },
    {
      width: 1920,
      height: 1080,
      duration: 6,
      mimeType: 'video/mp4',
      size: 100,
      hasAudio: false,
      audioPeaks: null,
    }
  );
}

function createVideoClip(trackId: string, assetId: string) {
  return {
    id: 'clip-1',
    trackId,
    type: VideoProjectClipType.VIDEO,
    name: 'Clip 1',
    groupId: null,
    linkMode: 'DETACHED',
    startTime: 1,
    duration: 4,
    muted: false,
    volume: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: 'NONE',
    transitionOut: 'NONE',
    transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
    assetId,
    fitMode: 'CONTAIN',
    sourceStart: 0,
    sourceDuration: 4,
  } as const;
}

function seedSingleClipState(runtime: ReturnType<typeof createMutableState>, locked = false) {
  const project = runtime.getState().project!;
  const asset = createVideoAsset();
  const trackId = project.tracks[0]!.id;

  runtime.set({
    project: {
      ...project,
      assets: [asset],
      tracks: project.tracks.map((track) => (track.id === trackId ? { ...track, locked } : track)),
      clips: [createVideoClip(trackId, asset.id)],
    },
    selectedClipId: 'clip-1',
    selectedTrackId: trackId,
    selection: { kind: 'clip', clipId: 'clip-1' },
  });

  return { asset, project, trackId };
}

function createLinkedVideoClip(trackId: string, assetId: string) {
  return {
    ...createVideoClip(trackId, assetId),
    id: 'video-1',
    groupId: 'group-1',
    linkMode: VideoClipLinkMode.LINKED,
    name: 'Video 1',
  };
}

function createLinkedAudioClip(trackId: string, assetId: string) {
  return {
    id: 'audio-1',
    trackId,
    type: VideoProjectClipType.AUDIO,
    name: 'Audio 1',
    groupId: 'group-1',
    linkMode: VideoClipLinkMode.LINKED,
    startTime: 1,
    duration: 4,
    muted: false,
    volume: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: 'NONE',
    transitionOut: 'NONE',
    transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
    assetId,
    sourceStart: 0,
    sourceDuration: 4,
  } as const;
}

function seedLinkedClipState(runtime: ReturnType<typeof createMutableState>) {
  const project = runtime.getState().project!;
  const asset = createVideoAsset();

  runtime.set({
    project: {
      ...project,
      assets: [asset],
      clips: [
        createLinkedVideoClip(project.tracks[0]!.id, asset.id),
        createLinkedAudioClip(project.tracks[1]!.id, asset.id),
      ],
    },
  });
}

function expectClipDeletionPrunesAssets(runtime: ReturnType<typeof createMutableState>) {
  expect(runtime.getState().project?.clips).toEqual([]);
  expect(runtime.getState().project?.assets).toEqual([]);
  expect(runtime.getState().selection).toEqual({ kind: 'scene' });
}

function expectLockedDeletePreservesProject(runtime: ReturnType<typeof createMutableState>) {
  expect(runtime.getState().project?.clips).toHaveLength(1);
  expect(runtime.getState().project?.assets).toHaveLength(1);
}

function findDuplicatedVideoId(runtime: ReturnType<typeof createMutableState>) {
  return runtime
    .getState()
    .project!.clips.find(
      (clip) => clip.id !== 'video-1' && clip.type === VideoProjectClipType.VIDEO
    )?.id;
}

function expectTimelineMutationSequence(runtime: ReturnType<typeof createMutableState>) {
  expect(runtime.getState().project!.clips.some((clip) => clip.startTime === 2.5)).toBe(true);
  expect(
    runtime.getState().project!.clips.filter((clip) => clip.type === VideoProjectClipType.VIDEO)
      .length
  ).toBeGreaterThan(2);
}

it('deletes editable clips and prunes orphaned assets from the project state', () => {
  vi.spyOn(Date, 'now').mockReturnValue(700);
  const runtime = createMutableState();
  const actions = createVideoEditorProjectClipTimelineActions(runtime.set);
  seedSingleClipState(runtime);

  actions.deleteClip('clip-1');

  expectClipDeletionPrunesAssets(runtime);
});

it('keeps state unchanged when deleting a missing or locked clip target', () => {
  const runtime = createMutableState();
  const actions = createVideoEditorProjectClipTimelineActions(runtime.set);
  seedSingleClipState(runtime, true);
  const beforeMissingDelete = runtime.getState().project;

  actions.deleteClip('missing');
  expect(runtime.getState().project).toBe(beforeMissingDelete);

  actions.deleteClip('clip-1');
  expectLockedDeletePreservesProject(runtime);
});

it('applies move trim split duplicate and detach actions through the timeline action owner', () => {
  const runtime = createMutableState();
  const actions = createVideoEditorProjectClipTimelineActions(runtime.set);
  seedLinkedClipState(runtime);

  actions.detachClipGroup('video-1');
  actions.duplicateClip('video-1');
  const duplicatedClipId = findDuplicatedVideoId(runtime);

  expect(duplicatedClipId).toBeTruthy();

  actions.moveClip('video-1', 2);
  actions.closeTrackGap('missing-track', 1, 2);
  actions.trimClipStart('video-1', 2.5);
  actions.trimClipEnd('video-1', 5);
  actions.splitClipAt('video-1', 3.5);

  expectTimelineMutationSequence(runtime);
});
