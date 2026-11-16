import { fixture as interactionFixture } from '../../../../features/video/review/project-conversion.test-support';
import { resolveVideoCompositionCursor } from '../../../../features/video/composition/timeline/frame/cursor';
import { authoredCursorFocusPath } from '../../../../features/video/project/cursor-focus-path/authoring';
import {
  resolveProjectCursorFocusPath,
  resolveProjectCursorFocus,
} from '../../../../features/video/project/cursor-focus-path/projection';
import { resolveVideoProjectActionOccurrences } from '../../../../features/video/project/action-occurrences';
import { cameraFixture } from '../../../../features/video/review/project-conversion.test-support';
import { planReviewProjectConversion } from '../../../../features/video/review/project-conversion';
import { resolveCameraVisualClip } from '../../../../features/video/project/camera/animation';
import { resolveCameraSplitPresentation } from '../../../../features/video/project/camera/split';
import { getVideoClipSourceTime } from '../../../../features/video/project/timeline/rate';
import { parseHydratableVideoProject } from '../../../../features/video/project/validation/root';
import type { VideoProjectVideoClip } from '../../../../features/video/project/types';
import { prefixVideoProjectComposition } from '../../../../features/video/project/timeline/composition-prefix';
import { createVideoEditorProjectTestStore } from '../test-store.test-support';
import { moveProjectClip } from './move';
import { duplicateProjectClipsWithResult, splitProjectClipsAtTimeWithResult } from './split';
import { planSourceRangeCompression } from './source-range';
import { createEffectHostClip } from '../../../../features/video/project/factories/overlay-clip';
import { describe, expect, it, vi } from 'vitest';

import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import {
  createRecordingBaseClip,
  createRecordingProjectAsset,
} from '../../../../features/video/project/factories/recording';
import type { VideoProject, VideoProjectClip } from '../../../../features/video/project/types';
import { createShiftedClipStartPatch } from './clip-shifts';

describe('clip shift EffectV1 ownership', () => {
  it('returns only shifted clips when the project has no effect branch', () => {
    const project = createProject();
    Reflect.deleteProperty(project, 'effectInstances');

    const patch = createShiftedClipStartPatch({
      clipIds: new Set([project.clips[0]!.id]),
      delta: 2,
      project,
    });

    expect(patch.clips[0]!.startTime).toBe(3);
    expect(patch).not.toHaveProperty('effectInstances');
  });
});

describe('clip shift EffectV1 timing', () => {
  it('moves only the shifted host annotation clock by the exact clamped host delta', () => {
    const project = createProject();
    const moving = createInstance('shifted', 1, { kind: 'scene' });
    const stable = createInstance('stable', 4, { kind: 'scene' });
    const hosts = [moving, stable].map((instance) =>
      createEffectHostClip({
        duration: instance.duration,
        effectInstanceId: instance.id,
        name: instance.id,
        projectHeight: project.height,
        projectWidth: project.width,
        startTime: instance.startTime,
        trackId: project.tracks[0]!.id,
      })
    );
    project.clips.push(...hosts);
    project.effectInstances = [moving, stable];
    const patch = createShiftedClipStartPatch({
      clipIds: new Set([hosts[0]!.id]),
      delta: -5,
      project,
    });
    expect(patch.clips.find((clip) => clip.id === hosts[0]!.id)?.startTime).toBe(0);
    expect(patch.effectInstances).toEqual([{ ...moving, startTime: 0 }, stable]);
    expect(project.effectInstances).toEqual([moving, stable]);
  });

  it('supports the caller-owned clip updater without changing unrelated clips', () => {
    const project = createProject();
    const updateClip = vi.fn((clip: VideoProjectClip, startTime: number) => ({
      ...clip,
      name: 'updated',
      startTime,
    }));

    const patch = createShiftedClipStartPatch({
      clipIds: new Set([project.clips[0]!.id]),
      delta: 1,
      project,
      updateClip,
    });

    expect(updateClip).toHaveBeenCalledOnce();
    expect(patch.clips[0]).toEqual(expect.objectContaining({ name: 'updated', startTime: 2 }));
    expect(patch.clips[1]).toBe(project.clips[1]);
  });
});

function createProject(): VideoProject {
  const project = createEmptyVideoProject('clip-shifts');
  const asset = createRecordingProjectAsset({
    duration: 10,
    filename: 'recording.webm',
    height: 720,
    mimeType: 'video/webm',
    recordingId: 'recording',
    size: 1,
    width: 1280,
  });
  const trackId = project.tracks[0]!.id;
  const first = createRecordingBaseClip(
    asset,
    { duration: 3, height: 720, width: 1280 },
    trackId,
    null
  );
  const second = createRecordingBaseClip(
    asset,
    { duration: 3, height: 720, width: 1280 },
    trackId,
    null
  );
  first.startTime = 1;
  second.startTime = 5;
  return { ...project, assets: [asset], clips: [first, second] };
}

function createInstance(
  id: string,
  startTime: number,
  target: NonNullable<VideoProject['effectInstances']>[number]['target']
) {
  return {
    controls: {},
    duration: 1,
    enabled: true,
    id,
    kind: 'standalone',
    playbackRate: 1,
    snapshotId: `snapshot-${id}`,
    startTime,
    target,
  } satisfies NonNullable<VideoProject['effectInstances']>[number];
}

function prepared(input: ReturnType<typeof cameraFixture>) {
  const plan = planReviewProjectConversion(input);
  if (plan.status !== 'prepared') throw new Error(JSON.stringify(plan));
  return plan;
}

function cameras(project: VideoProject): VideoProjectVideoClip[] {
  return project.clips.filter(
    (clip): clip is VideoProjectVideoClip =>
      clip.type === 'VIDEO' &&
      project.tracks.some((track) => track.id === clip.trackId && track.role === 'CAMERA')
  );
}

function editableResultCamera() {
  const input = cameraFixture();
  const webcam = input.document.advancedContent.webcam!;
  webcam.hiddenRanges = [{ id: 'hidden', start: 3.2, end: 3.8 }];
  webcam.positions = [
    {
      id: 'early',
      time: 1,
      placement: webcam.placement,
      transition: { type: 'none', duration: 0 },
    },
    {
      id: 'later',
      time: 3,
      placement: { x: 0.1, y: 0.1, width: 0.3, height: 0.4 },
      split: 'top',
      transition: { type: 'ease-in-out', duration: 1 },
    },
  ];
  input.document.edits = [
    {
      id: 'hold',
      kind: 'freeze',
      start: 2,
      end: 2,
      requestedStart: 2,
      requestedEnd: 2,
      duration: 2,
      frameTime: 1.98,
      frameDuration: 0.04,
    },
  ];
  const project = prepared(input).project;
  const camera = cameras(project).find((clip) => clip.startTime === 4)!;
  camera.groupId = null;
  camera.linkMode = 'DETACHED';
  project.clips = project.clips.filter(
    (clip) => clip.id === camera.id || clip.trackId !== camera.trackId
  );
  return { project, camera };
}

function expectCameraPhase(
  project: VideoProject,
  camera: VideoProjectVideoClip,
  original: VideoProjectVideoClip,
  time: number,
  originalTime: number
) {
  const actual = resolveCameraVisualClip(project, camera, time);
  const expected = resolveCameraVisualClip(project, original, originalTime);
  for (const key of ['x', 'y', 'width', 'height', 'rotation', 'opacity'] as const)
    expect(actual.transform[key]).toBeCloseTo(expected.transform[key], 8);
  const actualScreen = resolveCameraSplitPresentation(project, camera, time)?.screen;
  const expectedScreen = resolveCameraSplitPresentation(project, original, originalTime)?.screen;
  expect(!!actualScreen).toBe(!!expectedScreen);
  if (actualScreen && expectedScreen)
    for (const key of ['x', 'y', 'width', 'height'] as const)
      expect(actualScreen[key]).toBeCloseTo(expectedScreen[key], 8);
}

it('retains camera phase and visibility through move, duplicate and composition prefix', () => {
  const { project, camera } = editableResultCamera();
  const before = structuredClone(project);
  const moved = moveProjectClip(project, camera.id, 0);
  const movedCamera = cameras(moved).find((clip) => clip.id === camera.id)!;
  expect(movedCamera.startTime).toBe(0);
  const duplicate = duplicateProjectClipsWithResult(project, camera.id)!;
  const copied = cameras(duplicate.project).find((clip) => clip.id === duplicate.duplicateClipId)!;
  const prefixed = prefixVideoProjectComposition(project, 2)!;
  const shifted = cameras(prefixed).find((clip) => clip.id === camera.id)!;
  for (const local of [0.5, 1.25, 1.5, 1.9]) {
    expectCameraPhase(moved, movedCamera, camera, local, camera.startTime + local);
    expectCameraPhase(
      duplicate.project,
      copied,
      camera,
      copied.startTime + local,
      camera.startTime + local
    );
    expectCameraPhase(
      prefixed,
      shifted,
      camera,
      shifted.startTime + local,
      camera.startTime + local
    );
  }
  for (const result of [moved, duplicate.project, prefixed]) {
    expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(result)))).not.toBeNull();
    expect(
      cameras(result).every((clip) =>
        clip.cameraPositions?.every((position) => position.sourceTime >= 0)
      )
    ).toBe(true);
  }
  expect(project).toEqual(before);
});

it('scales retained camera layout through the public rate action and preserves split phase', () => {
  const { project, camera } = editableResultCamera();
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(project);
  store.getState().updateClipPlaybackRate(camera.id, 2);
  const rated = store.getState().project!;
  const changed = cameras(rated).find((clip) => clip.id === camera.id)!;
  expect(changed.playbackRate).toBe(2);
  for (const local of [0.5, 1.25, 1.5, 1.9])
    expectCameraPhase(
      rated,
      changed,
      camera,
      changed.startTime + local / 2,
      camera.startTime + local
    );
  const divided = splitProjectClipsAtTimeWithResult(rated, changed.id, changed.startTime + 0.5)!;
  expect(divided).not.toBeNull();
  const trailing = cameras(divided.project).find((clip) => clip.id === divided.trailingClipId)!;
  expectCameraPhase(
    divided.project,
    trailing,
    camera,
    trailing.startTime + 0.25,
    camera.startTime + 1.5
  );
  expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(divided.project)))).not.toBeNull();
});

it('scales linked camera layout through source-range compression', () => {
  const input = cameraFixture();
  input.document.edits = [
    {
      id: 'hold',
      kind: 'freeze',
      start: 2,
      end: 2,
      requestedStart: 2,
      requestedEnd: 2,
      duration: 2,
      frameTime: 1.98,
      frameDuration: 0.04,
    },
  ];
  input.document.advancedContent.webcam!.positions = [
    {
      id: 'later',
      time: 3,
      placement: { x: 0.1, y: 0.1, width: 0.3, height: 0.4 },
      transition: { type: 'ease-in-out', duration: 1 },
    },
  ];
  const project = prepared(input).project;
  const camera = cameras(project).find((clip) => clip.startTime === 4)!;
  const primary = project.clips.find(
    (clip) => clip.type === 'VIDEO' && clip.groupId === camera.groupId && clip.id !== camera.id
  )!;
  if (primary.type !== 'VIDEO' || !primary.sourceInstanceId) throw new Error('Missing main source');
  const result = planSourceRangeCompression(project, {
    clipId: primary.id,
    recordingId: 'recording',
    sourceInstanceId: primary.sourceInstanceId,
    sourceStart: 2,
    sourceEnd: 8,
    targetPlaybackRate: 2,
  });
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error('Compression refused');
  const changed = cameras(result.project).find((clip) => clip.id === camera.id)!;
  expectCameraPhase(
    result.project,
    changed,
    camera,
    changed.startTime + 0.75,
    camera.startTime + 1.5
  );
});

it('preserves an interrupted camera transition when a held placement moves left, changes rate and splits', () => {
  const input = cameraFixture();
  input.document.edits = [
    {
      id: 'hold',
      kind: 'freeze',
      start: 2,
      end: 2,
      requestedStart: 2,
      requestedEnd: 2,
      duration: 2,
      frameTime: 1.98,
      frameDuration: 0.04,
    },
  ];
  input.document.advancedContent.webcam!.hiddenRanges = [];
  input.document.advancedContent.webcam!.positions = [
    {
      id: 'ongoing',
      time: 1,
      placement: { x: 0.1, y: 0.1, width: 0.3, height: 0.4 },
      split: 'top',
      transition: { type: 'ease-in-out', duration: 4 },
    },
  ];
  const project = prepared(input).project;
  const camera = cameras(project).find((clip) => clip.startTime === 2)!;
  camera.groupId = null;
  camera.linkMode = 'DETACHED';
  project.clips = project.clips.filter(
    (clip) => clip.id === camera.id || clip.trackId !== camera.trackId
  );
  const snapshot = structuredClone(project);
  const moved = moveProjectClip(project, camera.id, 0);
  const shifted = cameras(moved).find((clip) => clip.id === camera.id)!;
  expectCameraPhase(moved, shifted, camera, 0.5, 2.5);
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(project);
  store.getState().updateClipPlaybackRate(camera.id, 2);
  const rated = store.getState().project!;
  const changed = cameras(rated).find((clip) => clip.id === camera.id)!;
  expectCameraPhase(rated, changed, camera, 2.25, 2.5);
  expect(getVideoClipSourceTime(changed, 2.25)).toBe(getVideoClipSourceTime(camera, 2.5));
  const split = splitProjectClipsAtTimeWithResult(rated, changed.id, 2.5)!;
  const trailing = cameras(split.project).find((clip) => clip.id === split.trailingClipId)!;
  expectCameraPhase(split.project, trailing, camera, 2.75, 3.5);
  expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(split.project)))).not.toBeNull();
  expect(project).toEqual(snapshot);
});

it('retains converted result cursor and input phase through Native move, duplicate, prefix, rate and split', () => {
  const input = interactionFixture();
  input.document.edits = [
    {
      id: 'hold',
      kind: 'freeze',
      start: 2,
      end: 2,
      requestedStart: 2,
      requestedEnd: 2,
      duration: 2,
      frameTime: 1.98,
      frameDuration: 0.04,
    },
  ];
  input.document.advancedContent.cursorMotions = [
    {
      id: 'cursor',
      start: 0,
      end: 10,
      timeDomain: 'result',
      enabled: true,
      shape: 'pointer',
      size: 44,
      color: '#eeeeee',
      outline: '#222222',
      shadow: true,
      easing: 'linear',
      points: [
        { id: 'a', at: 0, x: 0.2, y: 0.3 },
        { id: 'b', at: 1, x: 0.8, y: 0.7 },
      ],
    },
  ];
  input.document.advancedContent.interactionTimeline = {
    presses: [
      {
        id: 'held-key',
        family: 'keyboard',
        start: 2.5,
        end: 3,
        timeDomain: 'result',
        label: 'K',
        button: 0,
        x: 0.5,
        y: 0.5,
      },
    ],
    overrides: [],
  };
  const converted = planReviewProjectConversion(input);
  if (converted.status !== 'prepared') throw new Error(JSON.stringify(converted));
  const project = converted.project;
  const held = project.clips.find(
    (clip): clip is VideoProjectVideoClip => clip.type === 'VIDEO' && clip.startTime === 2
  )!;
  const snapshot = structuredClone(project);
  const cursor = resolveVideoCompositionCursor(project, 2.5, [], held.id)!;
  const check = (candidate: VideoProject, clipId: string, time: number) => {
    const reopened = parseHydratableVideoProject(JSON.parse(JSON.stringify(candidate)));
    expect(reopened).not.toBeNull();
    const actual = resolveVideoCompositionCursor(reopened!, time, [], clipId);
    expect(actual?.x).toBeCloseTo(cursor.x, 8);
    expect(actual?.y).toBeCloseTo(cursor.y, 8);
    expect(resolveProjectCursorFocus(reopened!, time, undefined, clipId)?.x).toBeCloseTo(
      cursor.x,
      8
    );
    expect(
      resolveVideoProjectActionOccurrences(reopened!).find(
        (row) => row.clipId === clipId && row.event.label === 'K'
      )?.time
    ).toBeCloseTo(time, 8);
  };
  const moved = moveProjectClip(project, held.id, 12);
  check(moved, held.id, 12.5);
  const copied = duplicateProjectClipsWithResult(project, held.id)!;
  const copiedClip = copied.project.clips.find((clip) => clip.id === copied.duplicateClipId)!;
  check(copied.project, copiedClip.id, copiedClip.startTime + 0.5);
  check(prefixVideoProjectComposition(project, 2)!, held.id, 4.5);
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(project);
  store.getState().updateClipPlaybackRate(held.id, 2);
  const rated = store.getState().project!;
  check(rated, held.id, 2.25);
  const split = splitProjectClipsAtTimeWithResult(project, held.id, 2.25)!;
  check(split.project, split.trailingClipId, 2.5);
  const tail = project.clips.find(
    (clip): clip is VideoProjectVideoClip => clip.type === 'VIDEO' && clip.startTime === 4
  )!;
  const compressed = planSourceRangeCompression(project, {
    clipId: tail.id,
    recordingId: 'recording',
    sourceInstanceId: tail.sourceInstanceId!,
    sourceStart: 2,
    sourceEnd: 8,
    targetPlaybackRate: 2,
  });
  expect(compressed.status).toBe('ready');
  if (compressed.status === 'ready') {
    const changed = compressed.project.clips.find((clip) => clip.id === tail.id)!;
    const expectedTail = resolveVideoCompositionCursor(project, 4.5, [], tail.id)!;
    const actualTail = resolveVideoCompositionCursor(
      compressed.project,
      changed.startTime + 0.25,
      [],
      tail.id
    );
    expect(actualTail?.x).toBeCloseTo(expectedTail.x, 8);
    expect(actualTail?.y).toBeCloseTo(expectedTail.y, 8);
  }
  const authored = {
    ...project,
    cursorFocusPath: authoredCursorFocusPath(resolveProjectCursorFocusPath(project)),
  };
  const focused = resolveProjectCursorFocus(authored, 2.5, undefined, held.id)!;
  const duplicateAuthored = duplicateProjectClipsWithResult(authored, held.id)!;
  const duplicateHeld = duplicateAuthored.project.clips.find(
    (clip) => clip.id === duplicateAuthored.duplicateClipId
  )!;
  const copiedFocus = resolveProjectCursorFocus(
    duplicateAuthored.project,
    duplicateHeld.startTime + 0.5,
    undefined,
    duplicateHeld.id
  );
  expect(copiedFocus?.x).toBeCloseTo(focused.x, 8);
  expect(copiedFocus?.y).toBeCloseTo(focused.y, 8);
  expect(project).toEqual(snapshot);
});
