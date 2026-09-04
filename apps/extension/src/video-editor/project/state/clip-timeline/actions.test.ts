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
import { resetVideoEditorProjectHistory } from '../../history';
import { createProjectWithEffects } from '../effects.effect-instance.test-support';

function createMutableState() {
  const project = createEmptyVideoProject('Timeline actions');
  let state = {
    currentTime: 0,
    project,
    projectHistory: resetVideoEditorProjectHistory(project.id),
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

it('returns the authoritative applied clip timing after move and trim constraints', () => {
  const runtime = createMutableState();
  const actions = createVideoEditorProjectClipTimelineActions(runtime.set);
  seedSingleClipState(runtime);

  expect(actions.moveClip('clip-1', 2)).toEqual({
    clipId: 'clip-1',
    duration: 4,
    endTime: 6,
    startTime: 2,
    timelineLaneId: null,
    trackId: expect.any(String),
  });
  const trimmed = actions.trimClipStart('clip-1', 5.8);
  expect(trimmed).toMatchObject({
    clipId: 'clip-1',
    endTime: 6,
    startTime: 5.8,
    timelineLaneId: null,
    trackId: expect.any(String),
  });
  expect(trimmed?.duration).toBeCloseTo(0.2);
});

it('selects the trailing half and records one history entry after a split', () => {
  const runtime = createMutableState();
  const actions = createVideoEditorProjectClipTimelineActions(runtime.set);
  seedSingleClipState(runtime);
  runtime.set({ currentTime: 3 });

  actions.splitClipAt('clip-1', 3);

  const state = runtime.getState();
  expect(state.currentTime).toBe(3);
  expect(state.projectHistory.past).toHaveLength(1);
  expect(state.selection).toEqual({
    kind: 'clip',
    clipId: state.project?.clips.find((clip) => clip.id !== 'clip-1' && clip.startTime === 3)?.id,
  });
});

it('keeps selection and history unchanged when the split point is invalid', () => {
  const runtime = createMutableState();
  const actions = createVideoEditorProjectClipTimelineActions(runtime.set);
  seedSingleClipState(runtime);
  const before = runtime.getState();

  actions.splitClipAt('clip-1', 1.05);

  expect(runtime.getState().project).toBe(before.project);
  expect(runtime.getState().selection).toBe(before.selection);
  expect(runtime.getState().projectHistory.past).toHaveLength(0);
});

it('ignores split requests while no project is loaded', () => {
  const runtime = createMutableState();
  runtime.set({ project: null });
  const before = runtime.getState();

  createVideoEditorProjectClipTimelineActions(runtime.set).splitClipAt('clip-1', 3);

  expect(runtime.getState()).toEqual(before);
});

it('selects the trailing counterpart of the originally selected linked clip', () => {
  const runtime = createMutableState();
  const actions = createVideoEditorProjectClipTimelineActions(runtime.set);
  seedLinkedClipState(runtime);
  runtime.set({ currentTime: 3, selection: { kind: 'clip', clipId: 'video-1' } });

  actions.splitClipAt('video-1', 3);

  const state = runtime.getState();
  const selectedId = state.selection.kind === 'clip' ? state.selection.clipId : null;
  expect(state.project?.clips.find((clip) => clip.id === selectedId)).toMatchObject({
    startTime: 3,
    type: VideoProjectClipType.VIDEO,
  });
  expect(
    state.project?.clips.filter((clip) => clip.linkMode === VideoClipLinkMode.LINKED)
  ).toHaveLength(4);
});

it('selects the trailing standalone effect host after splitting it', () => {
  const runtime = createMutableState();
  const actions = createVideoEditorProjectClipTimelineActions(runtime.set);
  const project = createProjectWithEffects();
  const host = project.clips.find(
    (clip) => clip.type === VideoProjectClipType.EFFECT && clip.startTime === 1
  )!;
  runtime.set({
    currentTime: 2,
    project,
    projectHistory: resetVideoEditorProjectHistory(project.id),
    selection: { kind: 'clip', clipId: host.id },
  });

  actions.splitClipAt(host.id, 2);

  const state = runtime.getState();
  const selectedId = state.selection.kind === 'clip' ? state.selection.clipId : null;
  expect(state.project?.clips.find((clip) => clip.id === selectedId)).toMatchObject({
    startTime: 2,
    type: VideoProjectClipType.EFFECT,
  });
  expect(state.projectHistory.past).toHaveLength(1);
});
