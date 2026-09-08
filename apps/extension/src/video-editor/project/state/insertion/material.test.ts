import { bindMotionRegionToClip } from '../../../../features/video/project/motion/source-binding';
import { resolveVideoProjectActionOccurrences } from '../../../../features/video/project/action-occurrences';
import { expect, it, vi } from 'vitest';
import { createVideoProjectTrack } from '../../../../features/video/project/factories/creation';
import { VideoProjectAssetType, VideoTrackKind } from '../../../../features/video/project/types';
import { undoVideoEditorProjectHistory } from '../../history';
import { resolveEffectInstanceTime } from '../../../../features/video/project/effect-instance/timing';
import { createEffectHostClip } from '../../../../features/video/project/factories/overlay-clip';
import { createVideoProjectMotionRegion } from '../../../../features/video/project/motion';
import { resolveVideoCompositionCamera } from '../../../../features/video/composition/motion';
import { hydrateVideoProject } from '../../../../features/video/project/hydration';
import type { VideoEditorProjectState } from '../contracts';

import { setup } from './material.test-support';

it('appends at the current montage end and commits selection and history atomically', () => {
  const { store, asset, project } = setup();
  const overlay = createVideoProjectTrack('Overlay', -1, VideoTrackKind.PRIMARY);
  project.tracks.push(overlay);
  store.setState({ selectedTrackId: overlay.id });
  const listener = vi.fn((state: VideoEditorProjectState) => {
    expect(state.selection.kind).toBe('clip');
    if (state.selection.kind === 'clip') {
      const selectedId = state.selection.clipId;
      expect(state.project?.clips.some(({ id }) => id === selectedId)).toBe(true);
    }
  });
  store.subscribe(listener);
  const append = store.getState().appendMaterial;
  expect(append(asset.id).status).toBe('placed');
  expect(append(asset.id).status).toBe('placed');
  expect(store.getState().project?.clips.map(({ startTime }) => startTime)).toEqual([0, 6]);
  expect(store.getState().project?.clips.every(({ trackId }) => trackId === overlay.id)).toBe(true);
  expect(store.getState().project?.assets).toEqual([asset]);
  expect(store.getState().projectHistory.past).toHaveLength(2);
  expect(listener).toHaveBeenCalledTimes(2);
});

it('overlays linked video and audio at the playhead without touching occupied locked tracks', () => {
  const { store, asset } = setup(true);
  store.getState().appendMaterial(asset.id);
  const base = store.getState().project!;
  store.setState({
    currentTime: 2,
    project: {
      ...base,
      tracks: base.tracks.map((track) => ({ ...track, locked: true })),
    },
  });
  const before = store.getState().project!;
  const notifications = vi.fn();
  store.subscribe(notifications);
  expect(store.getState().overlayMaterial(asset.id).status).toBe('placed');
  const after = store.getState().project!;
  const added = after.clips.filter((clip) => !before.clips.some(({ id }) => id === clip.id));
  expect(after.clips.slice(0, before.clips.length)).toEqual(before.clips);
  expect(after.tracks.slice(0, before.tracks.length)).toEqual(before.tracks);
  expect(added).toHaveLength(2);
  expect(added.map(({ startTime }) => startTime)).toEqual([2, 2]);
  expect(new Set(added.map(({ groupId }) => groupId)).size).toBe(1);
  expect(added[0]!.groupId).not.toBeNull();
  expect(added[0]!.muted).toBe(true);
  expect(added[1]!.muted).toBe(false);
  const visual = after.tracks.find(({ id }) => id === added[0]!.trackId)!;
  expect(visual.kind).toBe(VideoTrackKind.PRIMARY);
  expect(visual.order).toBeLessThan(Math.min(...before.tracks.map(({ order }) => order)));
  expect(after.assets).toEqual([asset]);
  expect(store.getState().projectHistory.past).toHaveLength(2);
  expect(notifications).toHaveBeenCalledTimes(1);
});

it.each([VideoProjectAssetType.IMAGE, VideoProjectAssetType.AUDIO, VideoProjectAssetType.VIDEO])(
  'creates independent repeated %s overlays using the same source',
  (type) => {
    const { store, asset } = setup(false, type);
    expect(store.getState().overlayMaterial(asset.id).status).toBe('placed');
    const first = store.getState().project!.clips[0]!;
    expect(store.getState().overlayMaterial(asset.id).status).toBe('placed');
    const second = store.getState().project!.clips[1]!;
    expect(first).toEqual(expect.objectContaining({ assetId: asset.id }));
    expect(second).toEqual(expect.objectContaining({ assetId: asset.id }));
    expect(first.trackId).not.toBe(second.trackId);
    expect(first.id).not.toBe(second.id);
    expect([first.startTime, second.startTime]).toEqual([3, 3]);
    expect(store.getState().project!.tracks.find(({ id }) => id === first.trackId)?.kind).toBe(
      type === VideoProjectAssetType.AUDIO ? VideoTrackKind.AUDIO : VideoTrackKind.PRIMARY
    );
  }
);

it.each(['video', 'audio'] as const)(
  'rejects a locked %s destination without a partial group or history update',
  (kind) => {
    const { store, asset, project } = setup(true);
    const audio = createVideoProjectTrack('Audio', 1, VideoTrackKind.AUDIO);
    project.tracks.push(audio);
    const target = kind === 'audio' ? audio : project.tracks[0]!;
    target.locked = true;
    const before = store.getState();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.getState().appendMaterial(asset.id)).toEqual({
      status: 'rejected',
      reason: 'locked-track',
    });
    expect(store.getState()).toBe(before);
    expect(project.clips).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
  }
);

it('rejects stale material selection and an unloaded project without notifying subscribers', () => {
  const { store } = setup();
  const listener = vi.fn();
  const unsubscribe = store.subscribe(listener);
  expect(store.getState().appendMaterial('missing')).toEqual({
    status: 'rejected',
    reason: 'missing-material',
  });
  expect(listener).not.toHaveBeenCalled();
  unsubscribe();
  store.setState({ project: null });
  store.subscribe(listener);
  expect(store.getState().appendMaterial('missing')).toEqual({
    status: 'rejected',
    reason: 'no-project',
  });
  expect(listener).not.toHaveBeenCalled();
});

it('uses the root video track without a selected destination after visual sorting', () => {
  const { store, asset, project } = setup();
  const rootId = project.tracks[0]!.id;
  store.getState().overlayMaterial(asset.id);
  const layered = store.getState().project!;
  store.setState({
    selectedTrackId: null,
    project: { ...layered, tracks: [...layered.tracks].sort((a, b) => a.order - b.order) },
  });
  const result = store.getState().appendMaterial(asset.id);
  expect(result.status).toBe('placed');
  if (result.status === 'placed') {
    expect(store.getState().project!.clips.find(({ id }) => id === result.clipId)?.trackId).toBe(
      rootId
    );
  }
});

it('inserts inside linked media, shifts the tail and preserves source ranges in one history step', () => {
  const { store, asset } = setup(true);
  store.getState().appendMaterial(asset.id);
  const before = store.getState().project!;
  const listener = vi.fn();
  store.subscribe(listener);
  const result = store.getState().insertMaterial(asset.id);
  expect(result.status).toBe('placed');
  const after = store.getState().project!;
  expect(after.duration).toBe(12);
  for (const original of before.clips) {
    const lane = after.clips
      .filter(({ trackId }) => trackId === original.trackId)
      .sort((a, b) => a.startTime - b.startTime);
    expect(lane).toMatchObject([
      { id: original.id, startTime: 0, duration: 3, sourceStart: 0, sourceDuration: 3 },
      { startTime: 3, duration: 6, sourceStart: 0, sourceDuration: 6 },
      { startTime: 9, duration: 3, sourceStart: 3, sourceDuration: 3 },
    ]);
  }
  expect(new Set(after.clips.map(({ groupId }) => groupId)).size).toBe(3);
  expect(after.assets).toEqual(before.assets);
  expect(store.getState().projectHistory.past).toHaveLength(2);
  expect(listener).toHaveBeenCalledTimes(1);
});

it.each([0, 6])('inserts at boundary %s without creating empty segments', (currentTime) => {
  const { store, asset } = setup();
  store.getState().appendMaterial(asset.id);
  store.setState({ currentTime });
  expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
  expect(
    store
      .getState()
      .project!.clips.map(({ startTime }) => startTime)
      .sort((a, b) => a - b)
  ).toEqual([0, 6]);
  expect(store.getState().project!.clips.map(({ duration }) => duration)).toEqual([6, 6]);
});

it('rejects a locked tail without changing sources, timeline, selection or history', () => {
  const { store, asset } = setup();
  store.getState().appendMaterial(asset.id);
  store.getState().overlayMaterial(asset.id);
  const layered = store.getState().project!;
  const overlay = layered.clips[1]!;
  store.setState({
    project: {
      ...layered,
      tracks: layered.tracks.map((track) =>
        track.id === overlay.trackId ? { ...track, locked: true } : track
      ),
    },
  });
  const before = store.getState();
  const listener = vi.fn();
  store.subscribe(listener);
  expect(store.getState().insertMaterial(asset.id)).toEqual({
    status: 'rejected',
    reason: 'locked-track',
  });
  expect(store.getState()).toBe(before);
  expect(listener).not.toHaveBeenCalled();
});

it('keeps source anchors on the original tail when inserting the same recording again', () => {
  const { store, asset } = setup();
  asset.source = { kind: 'recording', recordingId: 'recording-a' };
  store.getState().appendMaterial(asset.id);
  const project = store.getState().project!;
  store.setState({
    project: {
      ...project,
      actionEvents: [0, 3, 5].map((time) => ({
        id: `event-${time}`,
        kind: 'CLICK',
        capturedDuration: 0.1,
        point: null,
        label: '',
        data: {},
        presentation: { preset: 'NONE' },
        anchor: {
          kind: 'recording-source',
          recordingId: 'recording-a',
          sourceInstanceId: project.clips.find((clip) => clip.type === 'VIDEO')!.sourceInstanceId!,
          sourceEventId: `raw-${time}`,
          sourceTime: time,
        },
      })),
    },
  });
  const result = store.getState().insertMaterial(asset.id);
  expect(result.status).toBe('placed');
  const after = store.getState().project!;
  expect(resolveVideoProjectActionOccurrences(after).map(({ time }) => time)).toEqual([0, 9, 11]);
  if (result.status === 'placed') {
    expect(
      resolveVideoProjectActionOccurrences(after).every((event) => event.clipId !== result.clipId)
    ).toBe(true);
  }
});

it('keeps clip effects on both split halves with continuous document time across the insert', () => {
  const { store, asset } = setup();
  store.getState().appendMaterial(asset.id);
  const project = store.getState().project!;
  const sourceClipId = project.clips[0]!.id;
  store.setState({
    project: {
      ...project,
      effectInstances: [
        {
          id: 'effect',
          kind: 'targetEffect',
          snapshotId: 'snapshot',
          enabled: true,
          controls: { color: 'red' },
          target: { kind: 'clip', clipId: sourceClipId },
          startTime: 0,
          duration: 6,
          playbackRate: 2,
        },
      ],
    },
  });
  store.getState().insertMaterial(asset.id);
  const effects = store.getState().project!.effectInstances!;
  expect(effects).toHaveLength(2);
  expect(effects[0]!.target).toEqual({ kind: 'clip', clipId: sourceClipId });
  expect(effects[1]!.target).not.toEqual(effects[0]!.target);
  expect(resolveEffectInstanceTime(effects[0]!, 12, 2)).toMatchObject({ effectTime: 4 });
  expect(resolveEffectInstanceTime(effects[1]!, 12, 9)).toMatchObject({ effectTime: 6 });
  expect(effects[1]!.snapshotId).toBe(effects[0]!.snapshotId);
});

it('moves a later camera with the original trailing group and restores the montage with undo', () => {
  const { store, asset } = setup(true);
  store.getState().appendMaterial(asset.id);
  const project = store.getState().project!;
  const video = project.clips.find((clip) => clip.type === 'VIDEO')!;
  if (video.type !== 'VIDEO') throw new Error('Expected video fixture');
  const cameraTrack = createVideoProjectTrack('Camera', -1, VideoTrackKind.PRIMARY);
  const camera = {
    ...video,
    id: 'camera',
    trackId: cameraTrack.id,
    startTime: 4,
    duration: 2,
    sourceDuration: 2,
  };
  const before = {
    ...project,
    tracks: [...project.tracks, cameraTrack],
    clips: [...project.clips, camera],
  };
  store.setState({ project: before });
  expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
  const state = store.getState();
  const trailing = state.project!.clips.find(
    (clip) => clip.trackId === video.trackId && clip.startTime === 9
  )!;
  expect(state.project!.clips.find(({ id }) => id === camera.id)).toEqual({
    ...camera,
    startTime: 10,
    groupId: trailing.groupId,
  });
  const undo = undoVideoEditorProjectHistory(state.projectHistory, state.project!);
  expect(undo?.status).toBe('applied');
  if (undo?.status === 'applied') expect(undo.project.clips).toEqual(before.clips);
});

it('keeps a standalone effect document phase across the inserted interval', () => {
  const { store, asset } = setup();
  store.getState().appendMaterial(asset.id);
  const project = store.getState().project!;
  const track = createVideoProjectTrack('Effect', -1, VideoTrackKind.PRIMARY);
  const host = createEffectHostClip({
    duration: 4,
    startTime: 1,
    effectInstanceId: 'effect',
    name: 'Effect',
    projectWidth: project.width,
    projectHeight: project.height,
    trackId: track.id,
  });
  store.setState({
    project: {
      ...project,
      tracks: [...project.tracks, track],
      clips: [...project.clips, host],
      effectInstances: [
        {
          id: 'effect',
          kind: 'standalone',
          snapshotId: 'snapshot',
          enabled: true,
          controls: {},
          target: { kind: 'scene' },
          startTime: 1,
          duration: 4,
          playbackRate: 2,
          sourceStart: 1,
        },
      ],
    },
  });
  expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
  const effects = store.getState().project!.effectInstances!;
  expect(effects).toMatchObject([
    { startTime: 1, duration: 2, playbackRate: 2, sourceStart: 1 },
    { startTime: 9, duration: 2, playbackRate: 2, sourceStart: 5 },
  ]);
  expect(resolveEffectInstanceTime(effects[1]!, 10, 9.5)).toMatchObject({ effectTime: 6 });
});

it.each([false, true])(
  'preserves framing geometry across insertion and reload (source bound: %s)',
  (bound) => {
    const { store, asset } = setup();
    store.getState().appendMaterial(asset.id);
    const project = store.getState().project!;
    const region = {
      ...createVideoProjectMotionRegion(project, 0),
      duration: 6,
      scale: 2,
      zoomInDuration: 2,
      zoomOutDuration: 2,
    };
    const clip = project.clips[0]!;
    if (clip.type !== 'VIDEO') throw new Error('Expected video');
    const before = {
      ...project,
      motionRegions: [bound ? bindMotionRegionToClip(region, clip) : region],
    };
    store.setState({ project: before });
    expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
    const after = hydrateVideoProject(store.getState().project!);
    expect(after.motionRegions).toHaveLength(2);
    const camera = (value: typeof before, currentTime: number) =>
      resolveVideoCompositionCamera({
        project: value,
        currentTime,
        actions: [],
        cursorSample: null,
      });
    for (const time of [0.5, 2.5, 3, 4.5, 5.5]) {
      const expected = camera(before, time);
      const actual = resolveVideoCompositionCamera({
        project: after,
        currentTime: time < 3 ? time : time + 6,
        actions: [],
        cursorSample: null,
      });
      expect(actual).toEqual({ ...expected, regionId: actual.regionId });
    }
    for (const time of [3, 5, 8.9]) {
      expect(
        resolveVideoCompositionCamera({
          project: after,
          currentTime: time,
          actions: [],
          cursorSample: null,
        }).scale
      ).toBe(1);
    }
    store.setState({ currentTime: 10 });
    expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
    const repeated = hydrateVideoProject(store.getState().project!);
    const expected = camera(before, 5.5);
    const actual = resolveVideoCompositionCamera({
      project: repeated,
      currentTime: 17.5,
      actions: [],
      cursorSample: null,
    });
    expect(actual).toEqual({ ...expected, regionId: actual.regionId });
  }
);

it('rejects insertion when an affected zoom lane is locked', () => {
  const { store, asset } = setup();
  store.getState().appendMaterial(asset.id);
  const project = store.getState().project!;
  store.setState({
    project: {
      ...project,
      motionRegions: [{ ...createVideoProjectMotionRegion(project, 4), duration: 1 }],
      utilityLanes: {
        actions: { visible: true, locked: false },
        camera: { visible: true, locked: true },
      },
    },
  });
  const before = store.getState();
  expect(store.getState().insertMaterial(asset.id)).toEqual({
    status: 'rejected',
    reason: 'locked-track',
  });
  expect(store.getState()).toBe(before);
});

it.each([VideoProjectAssetType.VIDEO, VideoProjectAssetType.AUDIO])(
  'inserts %s at the playhead on the selected compatible track',
  (type) => {
    const { store, asset, project } = setup(false, type);
    const kind =
      type === VideoProjectAssetType.AUDIO ? VideoTrackKind.AUDIO : VideoTrackKind.PRIMARY;
    const target = createVideoProjectTrack('Chosen', 3, kind);
    project.tracks.push(target);
    store.setState({ selectedTrackId: target.id, currentTime: 2 });
    const result = store.getState().insertMaterial(asset.id);
    expect(result.status).toBe('placed');
    const clip = store
      .getState()
      .project!.clips.find(({ id }) => id === (result.status === 'placed' ? result.clipId : ''));
    expect(clip).toMatchObject({ trackId: target.id, startTime: 2 });
  }
);

it.each([VideoProjectAssetType.VIDEO, VideoProjectAssetType.AUDIO])(
  'never inserts %s onto an incompatible selected track',
  (type) => {
    const { store, asset, project } = setup(false, type);
    const wrong = createVideoProjectTrack(
      'Wrong',
      5,
      type === VideoProjectAssetType.AUDIO ? VideoTrackKind.PRIMARY : VideoTrackKind.AUDIO
    );
    project.tracks.push(wrong);
    store.setState({ selectedTrackId: wrong.id });
    const result = store.getState().insertMaterial(asset.id);
    expect(result.status).toBe('placed');
    expect(store.getState().project!.clips.every((clip) => clip.trackId !== wrong.id)).toBe(true);
  }
);
it('rejects a selected locked track without moving existing clips or committing history', () => {
  const { store, asset, project } = setup();
  const track = { ...createVideoProjectTrack('Locked', 5, VideoTrackKind.PRIMARY), locked: true };
  project.tracks.push(track);
  store.setState({ selectedTrackId: track.id });
  expect(store.getState().insertMaterial(asset.id)).toEqual({
    status: 'rejected',
    reason: 'locked-track',
  });
  expect(store.getState().project).toBe(project);
  expect(store.getState().projectHistory.past).toHaveLength(0);
});
it('keeps embedded audio on an audio track when the chosen video track receives the picture', () => {
  const { store, asset, project } = setup(true);
  const track = createVideoProjectTrack('Chosen video', 5, VideoTrackKind.PRIMARY);
  project.tracks.push(track);
  store.setState({ selectedTrackId: track.id });
  expect(store.getState().insertMaterial(asset.id).status).toBe('placed');
  const next = store.getState().project!;
  expect(next.clips.find((clip) => clip.type === 'VIDEO')).toMatchObject({
    trackId: track.id,
    startTime: 3,
  });
  const audio = next.clips.find((clip) => clip.type === 'AUDIO')!;
  expect(next.tracks.find((track) => track.id === audio.trackId)?.kind).toBe(VideoTrackKind.AUDIO);
  expect(audio.startTime).toBe(3);
});
