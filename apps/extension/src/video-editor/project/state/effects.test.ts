import { bindMotionRegionToClip } from '../../../features/video/project/motion/source-binding';
import {
  createProject,
  createVideoClip,
} from '../../../features/video/project/timeline/project-meta.test.helpers';
import { describe, expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  VideoCursorAnimationPreset,
  VideoProjectTrackRole,
  VideoMotionFocusMode,
  VideoCursorCaptureMode,
  VideoCursorVisualPreset,
  type VideoProjectTransition,
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  VideoTemporalEasing,
  VideoTimelinePlacementMode,
  VideoTransitionEasing,
  VideoTransitionKind,
} from '../../../features/video/project/types';
import { createVideoEditorProjectTestStore } from './test-store.test-support';
import type { VideoEditorProjectState } from './contracts';
import { createVideoProjectMotionRegion } from '../../../features/video/project/motion';
import { undoVideoEditorProjectHistory, redoVideoEditorProjectHistory } from '../history';

it('preserves captured KEY identity when editing action details', () => {
  const project = createEffectProject();
  project.actionEvents[0]!.kind = VideoProjectActionEventKind.KEY;
  project.actionEvents[0]!.data = { code: 'Enter' };
  const store = createStoreState();
  store.getState().setProject(project);
  const captured = store.getState().project!.actionEvents[0]!;
  store
    .getState()
    .updateActionEventDetails(captured.id, { clipId: null, point: { x: 100, y: 200 } });
  expect(store.getState().project!.actionEvents[0]).toMatchObject({
    kind: VideoProjectActionEventKind.KEY,
    anchor: captured.anchor,
    data: captured.data,
  });
});

it('binds framing to a concrete source and detaches without changing visible timing', () => {
  const clip = createVideoClip({ sourceStart: 10, playbackRate: 2, duration: 4 });
  const project = createProject([clip]);
  const region = { ...createVideoProjectMotionRegion(project, 1), duration: 2 };
  project.motionRegions = [region];
  const store = createStoreState();
  store.getState().setProject(project);
  store.getState().updateMotionRegion(region.id, { sourceClipId: clip.id });
  const bound = store.getState().project!;
  expect(bound.motionRegions?.[0]?.sourceBinding).toMatchObject({
    clipId: clip.id,
    sourceStart: 12,
    sourceEnd: 16,
  });
  expect(bound.motionRegions?.[0]).not.toHaveProperty('sourceClipId');
  store.getState().updateMotionRegion(region.id, { sourceClipId: null });
  const detached = store.getState();
  expect(detached.project?.motionRegions?.[0]).not.toHaveProperty('sourceBinding');
  expect(detached.project?.motionRegions?.[0]).toMatchObject({ startTime: 1, duration: 2 });
  const undo = undoVideoEditorProjectHistory(detached.projectHistory, detached.project!);
  expect(undo?.status).toBe('applied');
  if (undo?.status !== 'applied') throw new Error('Expected undo');
  expect(undo.project.motionRegions).toEqual(bound.motionRegions);
});

it('commits a source-bound framing move and preserves it through reload and clip moves', () => {
  const clip = createVideoClip({
    startTime: 2,
    sourceStart: 10,
    duration: 8,
    sourceDuration: 16,
    playbackRate: 2,
  });
  const project = createProject([clip]);
  const region = bindMotionRegionToClip(
    { ...createVideoProjectMotionRegion(project, 3), duration: 2 },
    clip
  );
  project.motionRegions = [region];
  const store = createStoreState();
  store.getState().setProject(project);
  const before = store.getState().project!;
  store.getState().updateMotionRegion(region.id, { startTime: 6 });
  const moved = store.getState().project!;
  expect(moved.motionRegions?.[0]).toMatchObject({
    startTime: 6,
    duration: 2,
    sourceBinding: { clipId: clip.id, sourceStart: 18, sourceEnd: 22 },
  });
  const undo = undoVideoEditorProjectHistory(store.getState().projectHistory, moved);
  if (undo?.status !== 'applied') throw new Error('Expected undo');
  expect(undo.project.motionRegions).toEqual(before.motionRegions);
  store.getState().setProject(moved);
  expect(store.getState().project?.motionRegions).toEqual(moved.motionRegions);
  store.getState().moveClip(clip.id, 5);
  expect(store.getState().project?.motionRegions?.[0]).toMatchObject({ startTime: 9, duration: 2 });
});

it.each([
  [0, 2],
  [20, 8],
])('holds a source-bound framing move at its boundary: %s', (requested, applied) => {
  const clip = createVideoClip({ startTime: 2, duration: 8, sourceDuration: 8 });
  const project = createProject([clip]);
  const region = bindMotionRegionToClip(
    { ...createVideoProjectMotionRegion(project, 3), duration: 2 },
    clip
  );
  project.motionRegions = [region];
  const store = createStoreState();
  store.getState().setProject(project);
  store.getState().updateMotionRegion(region.id, { startTime: requested });
  expect(store.getState().project?.motionRegions?.[0]).toMatchObject({
    startTime: applied,
    duration: 2,
  });
});

it('rejects a source that does not cover framing, and rejects missing sources', () => {
  const clip = createVideoClip({ duration: 1, sourceDuration: 1 });
  const project = createProject([clip]);
  const region = { ...createVideoProjectMotionRegion(project, 0), duration: 2 };
  project.motionRegions = [region];
  const store = createStoreState();
  store.getState().setProject(project);
  const original = store.getState().project?.motionRegions;
  for (const sourceClipId of [clip.id, 'missing']) {
    store.getState().updateMotionRegion(region.id, { sourceClipId });
    expect(store.getState().project?.motionRegions).toEqual(original);
  }
});

it('refuses camera and hidden sources when binding framing', () => {
  for (const camera of [true, false]) {
    const clip = createVideoClip();
    const project = createProject([clip]);
    project.tracks = project.tracks.map((track) =>
      track.id === clip.trackId
        ? { ...track, visible: camera, ...(camera ? { role: VideoProjectTrackRole.CAMERA } : {}) }
        : track
    );
    const region = { ...createVideoProjectMotionRegion(project, 0), duration: 2 };
    project.motionRegions = [region];
    const store = createStoreState();
    store.getState().setProject(project);
    store.getState().updateMotionRegion(region.id, { sourceClipId: clip.id });
    expect(store.getState().project?.motionRegions?.[0]?.sourceBinding).toBeUndefined();
  }
});

it('edits one inherited split connection atomically across its parts and restores it with Undo', () => {
  const clip = createVideoClip();
  const project = createProject([clip]);
  const incomingConnection = { fromRegionId: 'previous', easing: VideoTemporalEasing.LINEAR };
  const base = createVideoProjectMotionRegion(project, 1);
  project.motionRegions = ['first', 'second'].map((id, index) => ({
    ...base,
    id,
    startTime: index * 2,
    duration: 2,
    incomingConnection,
    sourceBinding: {
      clipId: clip.id,
      animationGroupId: 'split-state',
      sourceStart: index * 2,
      sourceEnd: index * 2 + 2,
      animation: { start: index * 2, end: index * 2 + 2, duration: 4 },
    },
  }));
  const store = createStoreState();
  store.getState().setProject(project);
  store.getState().updateMotionRegion('second', {
    incomingConnection: { ...incomingConnection, easing: VideoTemporalEasing.EASE_IN_OUT },
  });
  const connected = store.getState().project!;
  expect(connected.motionRegions?.map((region) => region.incomingConnection?.easing)).toEqual([
    VideoTemporalEasing.EASE_IN_OUT,
    VideoTemporalEasing.EASE_IN_OUT,
  ]);
  store.getState().updateMotionRegion('second', { incomingConnection: null });
  const removed = store.getState();
  expect(removed.project?.motionRegions?.every((region) => !region.incomingConnection)).toBe(true);
  const undo = undoVideoEditorProjectHistory(removed.projectHistory, removed.project!);
  if (undo?.status !== 'applied') throw new Error('Expected undo');
  expect(undo.project.motionRegions).toEqual(connected.motionRegions);
});

it('deletes a source split part and restores its external connection in the same Undo', () => {
  const clip = createVideoClip();
  const project = createProject([clip, createVideoClip({ id: 'repeat', startTime: 8 })]);
  const region = bindMotionRegionToClip(
    { ...createVideoProjectMotionRegion(project, 2), duration: 4 },
    clip
  );
  const following = {
    ...createVideoProjectMotionRegion(project, 7),
    id: 'following',
    duration: 1,
    incomingConnection: { fromRegionId: region.id, easing: VideoTemporalEasing.LINEAR },
  };
  project.motionRegions = [region, following];
  const store = createStoreState();
  store.getState().setProject(project);
  store.getState().splitClipAt(clip.id, 4);
  const split = store.getState().project!;
  const child = split.clips.find((item) => item.id !== clip.id && item.id !== 'repeat')!;
  const childRegion = split.motionRegions!.find((item) => item.sourceBinding?.clipId === child.id)!;
  expect(
    split.motionRegions!.find((item) => item.id === following.id)!.incomingConnection?.fromRegionId
  ).toBe(childRegion.id);
  store.getState().deleteClip(child.id);
  const deleted = store.getState();
  expect(
    deleted.project!.motionRegions!.find((item) => item.id === following.id)!.incomingConnection
      ?.fromRegionId
  ).toBe(region.id);
  expect(deleted.project!.motionRegions!.some((item) => item.id === childRegion.id)).toBe(false);
  const undo = undoVideoEditorProjectHistory(deleted.projectHistory, deleted.project!);
  if (undo?.status !== 'applied') throw new Error('Expected undo');
  expect(undo.project.clips).toEqual(split.clips);
  expect(undo.project.motionRegions).toEqual(split.motionRegions);
});

it('deletes a framing state and its dependent connection as one reversible edit', () => {
  const project = createEmptyVideoProject();
  project.duration = 8;
  const first = { ...createVideoProjectMotionRegion(project, 0), id: 'first', duration: 2 };
  const second = { ...createVideoProjectMotionRegion(project, 4), id: 'second', duration: 2 };
  project.motionRegions = [first, second];
  const store = createStoreState();
  store.getState().setProject(project);
  store.getState().updateMotionRegion(second.id, {
    incomingConnection: { fromRegionId: first.id, easing: VideoTemporalEasing.LINEAR },
  });
  const connected = store.getState().project!;
  expect(connected.motionRegions?.[1]?.incomingConnection?.fromRegionId).toBe(first.id);
  store.setState({ selection: { kind: 'motion-connection', motionRegionId: second.id } });
  store.getState().deleteMotionRegion(first.id);
  const deleted = store.getState();
  expect(deleted.selection.kind).toBe('scene');
  expect(deleted.project?.motionRegions).toHaveLength(1);
  expect(deleted.project?.motionRegions?.[0]?.incomingConnection).toBeNull();
  const undo = undoVideoEditorProjectHistory(deleted.projectHistory, deleted.project!);
  expect(undo?.status).toBe('applied');
  if (undo?.status !== 'applied') throw new Error('Expected undo');
  expect(undo.project.motionRegions).toEqual(connected.motionRegions);
  const redo = redoVideoEditorProjectHistory(undo.history, undo.project);
  expect(redo?.status).toBe('applied');
  if (redo?.status !== 'applied') throw new Error('Expected redo');
  expect(redo.project.motionRegions).toEqual(deleted.project?.motionRegions);
});

function createStoreState() {
  return createVideoEditorProjectTestStore();
}

function createImageClip(id: string, trackId: string, startTime: number, assetId: string) {
  return {
    id,
    trackId,
    type: 'IMAGE',
    name: id,
    groupId: null,
    linkMode: 'DETACHED',
    startTime,
    duration: 3,
    muted: false,
    volume: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: 'NONE',
    transitionOut: 'NONE',
    transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
    assetId,
    fitMode: 'CONTAIN',
  } as never;
}

function createEffectActionEvent() {
  return {
    data: {},
    capturedDuration: 0.4,
    id: 'action-1',
    kind: VideoProjectActionEventKind.CLICK,
    label: 'Click',
    point: { x: 10, y: 20 },
    presentation: { preset: VideoProjectActionPreset.CLICK_RIPPLE },
    anchor: { kind: 'project' as const, time: 0.1 },
  };
}

function createEffectCursorTrack(): NonNullable<
  ReturnType<typeof createEmptyVideoProject>['cursorTrack']
> {
  return {
    captureMode: VideoCursorCaptureMode.SEPARATE,
    samples: [{ id: 'sample-1', time: 0.1, visible: true, x: 10, y: 20 }],
    skin: {
      animationPreset: VideoCursorAnimationPreset.NONE,
      color: '#fff',
      hidden: false,
      preset: VideoCursorVisualPreset.ARROW,
      scale: 1,
      shadow: true,
    },
  };
}

function createEffectMotionRegion() {
  return {
    duration: 1.5,
    easing: VideoTemporalEasing.EASE_IN_OUT,
    focusMode: VideoMotionFocusMode.MANUAL,
    focusPoint: { x: 50, y: 60 },
    id: 'motion-1',
    scale: 1.4,
    startTime: 0,
    targetAction: null,
    zoomInDuration: 0.2,
    zoomOutDuration: 0.2,
  };
}

function createEffectTransition(): VideoProjectTransition {
  return {
    direction: 'LEFT',
    duration: 1,
    easing: VideoTransitionEasing.LINEAR,
    highlightColor: '#f97316',
    id: 'transition-1',
    kind: VideoTransitionKind.CROSSFADE,
    intensity: 'BALANCED',
    leadingClipId: 'clip-a',
    renderKind: 'COMPOSITE',
    templateKind: 'CROSSFADE',
    trailingClipId: 'clip-b',
  };
}

function createEffectTemporalOwners() {
  return {
    actionEvents: [createEffectActionEvent()],
    cursorTrack: createEffectCursorTrack(),
    motionRegions: [createEffectMotionRegion()],
    transitions: [createEffectTransition()],
  };
}

function createEffectProject() {
  const project = createEmptyVideoProject('Effects');
  const [primaryTrack] = project.tracks;
  const temporalOwners = createEffectTemporalOwners();

  project.timelinePlacementMode = VideoTimelinePlacementMode.ALLOW_OVERLAP;
  project.clips = [
    createImageClip('clip-a', primaryTrack!.id, 0, 'asset-a'),
    createImageClip('clip-b', primaryTrack!.id, 2, 'asset-b'),
  ];
  project.transitions = temporalOwners.transitions;
  project.cursorTrack = temporalOwners.cursorTrack;
  project.actionEvents = temporalOwners.actionEvents;
  project.motionRegions = temporalOwners.motionRegions;

  return project;
}

function applyEffectMutations(store: ReturnType<typeof createStoreState>) {
  store.getState().updateTransitionEasing('transition-1', VideoTransitionEasing.EASE_IN_OUT);
  store.getState().updateTransitionDuration('transition-1', 0.5);
  store.getState().updateTransitionTemplate('transition-1', {
    direction: 'RIGHT',
    intensity: 'BOLD',
    templateKind: 'LIGHT_SWEEP',
  });
  store.getState().updateCursorSampleVisibility('sample-1', false);
  store.getState().updateCursorSampleInterpolation('sample-1', VideoTemporalEasing.EASE_OUT);
  store.getState().updateCursorSampleSkinOverride('sample-1', {
    color: '#22cc88',
    scale: 1.6,
    shadow: false,
  });
  store.getState().updateActionEventDetails('action-1', {
    clipId: null,
    point: { x: 2500, y: -10 },
    presentation: { duration: 0.8, preset: VideoProjectActionPreset.SPOTLIGHT },
  });
  store.getState().updateMotionRegion('motion-1', {
    duration: 4,
    scale: 10,
    targetAction: { eventId: 'action-1', clipId: null },
    zoomOutDuration: 8,
  });
  store.getState().deleteMotionRegion('missing-motion');
}

function expectEffectMutationResults(nextProject: NonNullable<VideoEditorProjectState['project']>) {
  expect(nextProject.transitions).toEqual([
    expect.objectContaining({
      direction: 'RIGHT',
      easing: VideoTransitionEasing.EASE_IN_OUT,
      intensity: 'BOLD',
      kind: 'LIGHT_SWEEP',
      renderKind: 'CSS_LIKE',
      templateKind: 'LIGHT_SWEEP',
    }),
  ]);
  expect(nextProject.clips.find((clip) => clip.id === 'clip-b')?.startTime).toBe(2.5);
  expect(nextProject.cursorTrack?.samples[0]).toEqual(
    expect.objectContaining({
      interpolation: VideoTemporalEasing.EASE_OUT,
      skinOverride: {
        animationPreset: VideoCursorAnimationPreset.NONE,
        color: '#22cc88',
        hidden: false,
        preset: VideoCursorVisualPreset.ARROW,
        scale: 1.6,
        shadow: false,
      },
      visible: false,
    })
  );
  expect(nextProject.actionEvents[0]).toEqual(
    expect.objectContaining({
      kind: VideoProjectActionEventKind.CLICK,
      presentation: {
        duration: 0.8,
        point: { x: 1920, y: 0 },
        preset: VideoProjectActionPreset.SPOTLIGHT,
      },
    })
  );
  expect(nextProject.motionRegions).toEqual([
    expect.objectContaining({
      duration: 4,
      scale: 4,
      targetAction: { eventId: 'action-1', clipId: null },
      zoomOutDuration: 4,
    }),
  ]);
}

describe('video editor project effects', () => {
  it(
    'updates transition easing and duration, cursor visibility, and action preset details',
    verifyEffectMutations
  );
  it('preserves captured kind across preset overrides and no-op updates', verifyEffectNoOpBranches);
  it('deletes motion regions through the effect action surface', verifyMotionRegionDelete);
  it(
    'supports cursor sample insertion and deletion plus action deletion through effect owners',
    verifyCursorAndActionCrud
  );
});

function verifyEffectMutations() {
  const store = createStoreState();
  store.getState().setProject(createEffectProject());

  applyEffectMutations(store);

  expectEffectMutationResults(store.getState().project!);
}

function verifyEffectNoOpBranches() {
  const store = createStoreState();
  store.getState().setProject(createEffectProject());

  store.getState().updateTransitionDuration('missing', 1);
  store.getState().updateTransitionTemplate('missing', { templateKind: 'PUSH' });
  store.getState().updateCursorSampleVisibility('missing', false);
  store.getState().updateCursorSampleSkinOverride('missing', { color: '#ff00aa' });
  store.getState().clearCursorSampleSkinOverride('missing');
  store.getState().updateActionEventDetails('action-1', {
    presentation: { preset: VideoProjectActionPreset.DWELL_ZOOM },
  });
  expect(store.getState().project?.actionEvents[0]?.kind).toBe(VideoProjectActionEventKind.CLICK);
  store.getState().updateActionEventDetails('action-1', {
    presentation: { preset: VideoProjectActionPreset.SCROLL_EMPHASIS },
  });
  expect(store.getState().project?.actionEvents[0]?.kind).toBe(VideoProjectActionEventKind.CLICK);
  store.getState().updateActionEventDetails('action-1', {
    presentation: { preset: VideoProjectActionPreset.NONE },
  });
  expect(store.getState().project?.actionEvents[0]?.kind).toBe(VideoProjectActionEventKind.CLICK);
}

function verifyMotionRegionDelete() {
  const store = createStoreState();
  store.getState().setProject(createEffectProject());

  store.getState().deleteMotionRegion('motion-1');

  expect(store.getState().project?.motionRegions).toEqual([]);
}

function verifyCursorAndActionCrud() {
  const store = createStoreState();
  const project = createEffectProject();
  store.getState().setProject(project);
  store.getState().selectActionOccurrence('action-1', null);
  store.getState().startActionPointPlacement('action-1', null);
  store.getState().deleteActionEvent('action-1');
  store.getState().insertCursorSample(0.2);

  const insertedSample = store
    .getState()
    .project?.cursorTrack?.samples.find((sample) => sample.time === 0.2);
  expect(insertedSample).toEqual(
    expect.objectContaining({
      interpolation: VideoTemporalEasing.LINEAR,
      visible: true,
    })
  );

  store.getState().selectCursorSegment('sample-1');
  store.getState().clearCursorSampleSkinOverride('sample-1');
  store.getState().deleteCursorSample('sample-1');

  expect(store.getState().project?.actionEvents).toEqual([]);
  expect(store.getState().placementMode).toBeNull();
  expect(store.getState().selection).toEqual({ kind: 'scene' });
  expect(
    store.getState().project?.cursorTrack?.samples.some((sample) => sample.id === 'sample-1')
  ).toBe(false);
}

it('updates inherited presentation, resets sparse overrides and restores edits with Undo', () => {
  const store = createStoreState();
  const project = createEffectProject();
  delete project.actionEvents[0]!.presentation;
  store.getState().setProject(project);
  const event = store.getState().project!.actionEvents[0]!;
  store.getState().updateActionPresentation({ duration: 1.2, offset: -0.3 });
  store.getState().updateActionEventDetails(event.id, { presentation: { enabled: false } });
  store.getState().updateActionPresentation({ duration: 1.8 });
  const overridden = store.getState().project!;
  expect(overridden.actionEvents[0]).toEqual({ ...event, presentation: { enabled: false } });
  expect(overridden.actionPresentation).toMatchObject({ duration: 1.8, offset: -0.3 });
  store.getState().updateActionEventDetails(event.id, { presentation: null });
  const reset = store.getState();
  expect(reset.project!.actionEvents[0]).toEqual(event);
  const undo = undoVideoEditorProjectHistory(reset.projectHistory, reset.project!);
  if (undo?.status !== 'applied') throw new Error('Expected undo');
  expect(undo.project.actionEvents).toEqual(overridden.actionEvents);
  store.getState().setProject(JSON.parse(JSON.stringify(overridden)));
  expect(store.getState().project!.actionPresentation).toEqual(overridden.actionPresentation);
  expect(store.getState().project!.actionEvents).toEqual(overridden.actionEvents);
});

it('rejects invalid presentation values and blocks locked history edits', () => {
  const store = createStoreState();
  store.getState().setProject(createEffectProject());
  const event = store.getState().project!.actionEvents[0]!;
  const before = store.getState().project!;
  store.getState().updateActionPresentation({ duration: NaN });
  store.getState().updateActionEventDetails(event.id, { presentation: { offset: Infinity } });
  expect(store.getState().project).toBe(before);
  store.getState().toggleUtilityLaneLock('actions');
  const locked = store.getState().project;
  store.getState().updateActionPresentation({ enabled: false });
  store.getState().updateActionEventDetails(event.id, { presentation: { enabled: false } });
  store.getState().updateActionEventDetails(event.id, { clipId: null, point: { x: 1, y: 1 } });
  store.getState().toggleUtilityLaneVisibility('actions');
  expect(store.getState().project).toBe(locked);
});

it('requires an exact current occurrence for source-point edits and shares the fact override across repeats', () => {
  const project = createProject([
    createVideoClip({ id: 'first', sourceInstanceId: 'instance', startTime: 0 }),
    createVideoClip({ id: 'repeat', sourceInstanceId: 'instance', startTime: 8 }),
  ]);
  project.actionEvents = [
    {
      id: 'fact',
      kind: 'CLICK',
      label: 'Click',
      data: {},
      point: { x: 0.2, y: 0.3 },
      anchor: {
        kind: 'recording-source',
        recordingId: 'rec-asset-video',
        sourceInstanceId: 'instance',
        sourceEventId: 'raw',
        sourceTime: 1,
      },
    },
  ];
  const store = createStoreState();
  store.getState().setProject(project);
  const before = store.getState().project!;
  for (const clipId of [null, 'missing']) {
    store.getState().updateActionEventDetails('fact', { clipId, point: { x: 0.7, y: 0.8 } });
    expect(store.getState().project).toBe(before);
  }
  store
    .getState()
    .updateActionEventDetails('fact', { clipId: 'repeat', point: { x: 0.7, y: 0.8 } });
  const after = store.getState();
  expect(after.project!.actionEvents).toEqual([
    { ...before.actionEvents[0], presentation: { point: { x: 0.7, y: 0.8 } } },
  ]);
  const undo = undoVideoEditorProjectHistory(after.projectHistory, after.project!);
  expect(undo?.status).toBe('applied');
  if (undo?.status !== 'applied') throw new Error('Expected undo');
  expect(undo.project.actionEvents).toEqual(before.actionEvents);
});

it('moves an action presentation while retaining its original fact and other overrides', () => {
  const project = createEffectProject();
  const store = createStoreState();
  store.getState().setProject(project);
  const original = store.getState().project!.actionEvents[0]!;
  store.getState().updateActionEventDetails(original.id, {
    clipId: null,
    presentation: { preset: 'SPOTLIGHT', duration: 0.9 },
  });
  const before = store.getState().project!;
  store.getState().updateActionEventDetails(original.id, { clipId: null, time: 2.5 });
  const updated = store.getState().project!.actionEvents[0]!;
  expect(updated.anchor).toEqual(original.anchor);
  expect(updated.data).toEqual(original.data);
  expect(updated.presentation).toMatchObject({
    preset: 'SPOTLIGHT',
    duration: 0.9,
    offset: 2.5 - (original.anchor.kind === 'project' ? original.anchor.time : 0),
  });
  const undo = undoVideoEditorProjectHistory(
    store.getState().projectHistory,
    store.getState().project!
  );
  if (undo?.status !== 'applied') throw new Error('Expected undo');
  expect(undo.project.actionEvents).toEqual(before.actionEvents);
});
