import { expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import {
  createEmptyVideoProject,
  createVideoProjectFromRecording,
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
import { splitProjectClipsAtTimeWithResult, duplicateProjectClipsWithResult } from './split';
import { normalizeVideoProjectCursorSkin } from '../../../../features/video/project/cursor';
import {
  deriveProjectCursorFocusPath,
  resolveProjectCursorFocusPath,
} from '../../../../features/video/project/cursor-focus-path/projection';
import {
  authoredCursorFocusPath,
  insertCursorFocusKey,
  updateCursorFocusKey,
} from '../../../../features/video/project/cursor-focus-path/authoring';
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

it('duplicates source-bound click, release, dwell and manual keys with independent retained identity', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'take',
    filename: 'take.webm',
    width: 100,
    height: 100,
    duration: 4,
    mimeType: 'video/webm',
    size: 10,
    cursorTrack: {
      captureMode: 'embedded-fallback',
      skin: normalizeVideoProjectCursorSkin(undefined),
      samples: [0, 1, 2, 3].map((time) => ({
        id: `fact:${time}`,
        time,
        x: 20,
        y: 30,
        visible: true,
        captureSegment: 0,
        observation: 'observed',
        recordingPoint: { x: 0.2, y: 0.3 },
      })),
    },
    sourceNormalizedActionEvents: [
      {
        id: 'click',
        kind: 'CLICK',
        time: 0.5,
        duration: 0.5,
        point: { x: 0.2, y: 0.3 },
        label: 'Click',
        preset: 'NONE',
        data: {
          gestureId: 'click',
          gestureType: 'hold',
          completion: 'released',
          downTime: 0.5,
          upTime: 1,
          pressDuration: 0.5,
          recordingUpX: 0.4,
          recordingUpY: 0.5,
        },
      },
    ],
    recordingSignals: [
      {
        id: 'dwell',
        kind: 'cursor-idle',
        startTime: 2,
        endTime: 3,
        point: null,
        recordingPoint: { x: 0.2, y: 0.3 },
        data: {},
      },
    ],
  });
  const original = project.clips.find((clip) => clip.type === 'VIDEO')!;
  project.clips.push({
    ...original,
    id: 'other-clip',
    sourceInstanceId: 'other-instance',
    startTime: 5,
  });
  project.duration = 9;
  project.actionEvents.push(
    {
      ...project.actionEvents[0]!,
      id: 'other-action',
      anchor: {
        kind: 'recording-source',
        recordingId: 'take',
        sourceInstanceId: 'other-instance',
        sourceEventId: 'other',
        sourceTime: 1,
      },
    },
    {
      id: 'scene-action',
      kind: 'CLICK',
      anchor: { kind: 'project', time: 1 },
      point: null,
      label: '',
      data: {},
    }
  );
  project.actionFeedback!.push({
    recordingId: 'take',
    sourceInstanceId: 'other-instance',
    signals: [],
    settings: [],
  });
  let path = deriveProjectCursorFocusPath(project);
  const segment = path.segments[0]!;
  for (const key of segment.keys)
    path = updateCursorFocusKey(path, key.id, { interpolation: 'linear' });
  path = insertCursorFocusKey(path, segment.id, { id: 'manual', time: 0.75, x: 0.6, y: 0.7 });
  path = updateCursorFocusKey(path, 'manual', {
    incoming: { x: 0.4, y: 0.5 },
    outgoing: { x: 0.8, y: 0.9 },
  });
  path.segments.push({
    id: 'scene-path',
    binding: { kind: 'project' },
    start: 0,
    end: 9,
    keys: [{ id: 'scene-key', time: 2, x: 0.5, y: 0.5, anchor: 'manual', interpolation: 'linear' }],
  });
  project.cursorFocusPath = authoredCursorFocusPath(path);
  const facts = structuredClone(project);
  const result = duplicateProjectClipsWithResult(project, original.id)!;
  expect(result).not.toBeNull();
  const copiedClip = result.project.clips.find((clip) => clip.id === result.duplicateClipId)!;
  if (copiedClip.type !== 'VIDEO') throw new Error('Expected duplicated video');
  expect(copiedClip.sourceInstanceId).not.toBe(original.sourceInstanceId);
  const copied = result.project.cursorFocusPath!.segments.find(
    (item) =>
      item.binding.kind === 'recording-source' &&
      item.binding.sourceInstanceId === copiedClip.sourceInstanceId
  )!;
  expect(copied.keys.map(({ id: _id, ...key }) => key)).toEqual(
    project
      .cursorFocusPath!.segments.find((item) => item.id === segment.id)!
      .keys.map(({ id: _id, ...key }) => key)
  );
  expect(
    copied.keys.every(
      (key) =>
        !project
          .cursorFocusPath!.segments.flatMap((item) => item.keys)
          .some((originalKey) => originalKey.id === key.id)
    )
  ).toBe(true);
  const copiedAction = result.project.actionEvents.find(
    (event) =>
      event.anchor.kind === 'recording-source' &&
      event.anchor.sourceInstanceId === copiedClip.sourceInstanceId
  )!;
  expect(copied.keys.some((key) => key.id === `click:${copiedAction.id}`)).toBe(true);
  expect(copied.keys.some((key) => key.id === `release:${copiedAction.id}`)).toBe(true);
  expect(
    copied.keys.some((key) => key.id === `dwell-start:${copiedClip.sourceInstanceId}:dwell`)
  ).toBe(true);
  expect(
    result.project.cursorFocusPath!.segments.filter((item) => item.binding.kind === 'project')
  ).toHaveLength(1);
  expect(result.project.actionFeedback).toHaveLength(3);
  expect(project).toEqual(facts);
});

it.each(['boundary', 'click', 'dwell'] as const)(
  'reuses the copied %s focus override when its captured anchor is edited again',
  (anchor) => {
    const project = createVideoProjectFromRecording({
      recordingId: 'take',
      filename: 'take.webm',
      width: 100,
      height: 100,
      duration: 4,
      mimeType: 'video/webm',
      size: 10,
      cursorTrack: {
        captureMode: 'embedded-fallback',
        skin: normalizeVideoProjectCursorSkin(undefined),
        samples: [0, 1, 2, 3].map((time) => ({
          id: `sample:${time}`,
          time,
          x: 20,
          y: 30,
          visible: true,
          captureSegment: 0,
          observation: 'observed',
          recordingPoint: { x: 0.2, y: 0.3 },
        })),
      },
      sourceNormalizedActionEvents: [
        {
          id: 'click',
          kind: 'CLICK',
          time: 0.5,
          duration: 0.3,
          point: { x: 0.2, y: 0.3 },
          label: 'Click',
          data: {},
          preset: 'NONE',
        },
      ],
      recordingSignals: [
        {
          id: 'idle',
          kind: 'cursor-idle',
          startTime: 1,
          endTime: 2,
          point: null,
          recordingPoint: { x: 0.2, y: 0.3 },
          data: {},
        },
      ],
    });
    const initial = deriveProjectCursorFocusPath(project);
    const key = initial.segments
      .flatMap((segment) => segment.keys)
      .find((item) => item.anchor === anchor)!;
    project.cursorFocusPath = authoredCursorFocusPath(
      updateCursorFocusKey(initial, key.id, { x: 0.7 })
    );
    const copy = duplicateProjectClipsWithResult(project, project.clips[0]!.id)!;
    const clip = copy.project.clips.find((item) => item.id === copy.duplicateClipId)!;
    if (clip.type !== 'VIDEO') throw new Error('Expected copied video');
    const path = resolveProjectCursorFocusPath(copy.project);
    const segment = path.segments.find(
      (item) =>
        item.binding.kind === 'recording-source' &&
        item.binding.sourceInstanceId === clip.sourceInstanceId
    )!;
    const captured = segment.keys.find((item) => item.anchor === anchor && item.time === key.time)!;
    expect(segment.keys.filter((item) => item.anchor === 'manual')).toHaveLength(1);
    const changed = updateCursorFocusKey(path, captured.id, { x: 0.8 });
    const edited = changed.segments.find((item) => item.id === segment.id)!;
    expect(edited.keys.filter((item) => item.anchor === 'manual')).toEqual([
      expect.objectContaining({ id: `focus-override:${captured.id}`, x: 0.8 }),
    ]);
    expect(segment.keys.filter((item) => item.anchor === 'manual')[0]!.x).toBe(0.7);
    expect(
      project.cursorFocusPath.segments
        .flatMap((item) => item.keys)
        .filter((item) => item.anchor === 'manual')
    ).toHaveLength(1);
  }
);

it('keeps camera appearance through a partial rate-two split and independent duplicate', async () => {
  const { project, screen, camera, cameraTrack } = setup(1, 4);
  cameraTrack.role = 'CAMERA';
  const cameraAppearance = {
    shape: 'circle' as const,
    roundness: 61,
    zoom: 1.5,
    panX: 0.2,
    panY: -0.1,
  };
  const cameraPositions = [
    {
      id: 'crop',
      sourceTime: 4,
      transform: { ...camera.transform },
      fitMode: camera.fitMode,
      transition: { kind: 'smooth' as const, duration: 2 },
      crop: { zoom: 3, panX: -0.5, panY: 0.5 },
    },
  ];
  const mirrored = {
    ...camera,
    cameraMirrored: true,
    sourceCrop: { x: 0.25, y: 0.1, width: 0.5, height: 0.8 },
    shadowColor: '#ff008080',
    cameraAppearance,
    cameraPositions,
    cameraHiddenRanges: [{ id: 'hidden', start: 4, end: 6 }],
  };
  const authored = {
    ...project,
    version: 13 as const,
    clips: project.clips.map((clip) => (clip.id === camera.id ? mirrored : clip)),
  };
  const split = splitProjectClipsAtTimeWithResult(authored, camera.id, 3);
  expect(split).not.toBeNull();
  const cameraClips = split!.project.clips.filter((clip) => clip.trackId === cameraTrack.id);
  expect(cameraClips).toHaveLength(2);
  expect(
    cameraClips.every(
      (clip) =>
        clip.type === 'VIDEO' &&
        clip.cameraMirrored === true &&
        JSON.stringify(clip.sourceCrop) === JSON.stringify(mirrored.sourceCrop) &&
        clip.shadowColor === '#ff008080' &&
        clip.cameraAppearance?.shape === 'circle' &&
        JSON.stringify(clip.cameraPositions) === JSON.stringify(cameraPositions) &&
        JSON.stringify(clip.cameraHiddenRanges) === JSON.stringify(mirrored.cameraHiddenRanges)
    )
  ).toBe(true);
  expect(
    cameraClips.map((clip) =>
      clip.type === 'VIDEO' ? [clip.sourceStart, clip.sourceDuration, clip.playbackRate] : []
    )
  ).toEqual([
    [1, 4, 2],
    [5, 4, 2],
  ]);
  const { resolveCameraClip } = await import('../../../../features/video/project/camera/animation');
  const right = cameraClips.find((clip) => clip.startTime === 3);
  if (right?.type !== 'VIDEO') throw new Error('Expected right camera fragment');
  expect(resolveCameraClip(right, 3.25).cameraAppearance).toEqual(
    resolveCameraClip(mirrored, 3.25).cameraAppearance
  );
  const duplicate = duplicateProjectClipsWithResult(authored, camera.id);
  expect(duplicate).not.toBeNull();
  expect(
    duplicate!.project.clips.find((clip) => clip.id === duplicate!.duplicateClipId)
  ).toMatchObject({
    cameraMirrored: true,
    cameraAppearance,
    cameraPositions,
    cameraHiddenRanges: mirrored.cameraHiddenRanges,
    sourceCrop: mirrored.sourceCrop,
    shadowColor: '#ff008080',
    sourceStart: 1,
    sourceDuration: 8,
    playbackRate: 2,
  });
  expect(project.clips.find((clip) => clip.id === screen.id)).toBe(screen);
  expect('cameraMirrored' in camera).toBe(false);
});
