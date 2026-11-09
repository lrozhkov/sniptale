import { projectRecordingEventAction } from '../../features/video/project/recording-events/project-facts';
import type { RecordingEventRecord } from '../../features/video/project/recording-events/types';
import { applyVideoProjectMutationPatch } from '../../features/video/project/mutation';
import { describe, expect, it } from 'vitest';
import { createVideoProjectMotionRegion } from '../../features/video/project/motion';
import {
  createEmptyVideoProject,
  createVideoProjectFromRecording,
} from '../../features/video/project/factories/creation';
import {
  VideoCursorAnimationPreset,
  VideoCursorCaptureMode,
  VideoMotionFocusMode,
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  VideoTemporalEasing,
  VideoCursorVisualPreset,
} from '../../features/video/project/types';
import {
  createSelectionStateActions,
  resolveInitialSelectedTrackId,
  resolveSelectedTrackId,
} from './selection-actions';
import type { VideoEditorState } from './types';

function createSelectionStore() {
  let state = {
    currentTime: 0,
    error: null,
    exportState: {
      dialogOpen: false,
      error: null,
      isRunning: false,
      jobId: null,
      lastResult: null,
      settings: null,
      status: null,
    },
    isPlaying: false,
    isReady: true,
    placementMode: null,
    pixelsPerSecond: 90,
    project: createEmptyVideoProject('Selection'),
    recordingId: null,
    saveState: 'idle',
    selectedTrackId: null,
    selection: { kind: 'scene' },
  } as VideoEditorState;
  const set = (
    partial: Partial<VideoEditorState> | ((state: VideoEditorState) => Partial<VideoEditorState>)
  ) => {
    const nextState = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...nextState };
  };

  return {
    actions: createSelectionStateActions(set as never),
    getState: () => state,
  };
}

describe('video editor timeline selection state owner', () => {
  it(
    'covers placement and selection routing branches through the direct action owner',
    verifyDirectActionOwnerRouting
  );

  it('covers direct track helper fallbacks for missing clip and missing project state', () => {
    const project = createEmptyVideoProject('Selection helpers');

    expect(resolveSelectedTrackId({ project, selectedTrackId: 'track-1' }, null)).toBe('track-1');
    expect(resolveInitialSelectedTrackId(null)).toBeNull();
  });

  it(
    'routes cursor, clip, and motion-area selection through the direct owner actions',
    verifyCursorClipAndMotionAreaSelection
  );

  it('does not start utility lane placements when the lane is locked', () => {
    const store = createSelectionStore();
    store.getState().project!.utilityLanes = {
      actions: { visible: true, locked: true },
      camera: { visible: true, locked: true },
    };

    store.actions.startActionPointPlacement('action-1', null);
    store.actions.startMotionFocusPlacement('motion-1');

    expect(store.getState().placementMode).toBeNull();
  });
});

function verifyDirectActionOwnerRouting() {
  const store = createSelectionStore();
  const project = store.getState().project!;
  const [primaryTrack] = project.tracks;
  project.transitions = [
    {
      duration: 0.6,
      easing: 'LINEAR',
      id: 'transition-1',
      kind: 'CROSSFADE',
      leadingClipId: 'missing-a',
      trailingClipId: 'missing-b',
    },
  ] as never;

  store.actions.selectTrack(primaryTrack!.id);
  store.actions.selectTransition('transition-1');
  expect(store.getState().selectedTrackId).toBe(primaryTrack!.id);
  expectActionPlacementRouting(store);
  expectMotionFocusPlacementRouting(store);
  expectPlaybackStateClamp(store);
}

function expectActionPlacementRouting(store: ReturnType<typeof createSelectionStore>) {
  store.getState().project!.actionEvents = [createSeedActionEvent()];
  store.actions.startActionPointPlacement('action-1', null);
  store.actions.selectActionOccurrence('action-1', null);
  expect(store.getState().placementMode).toEqual({
    eventId: 'action-1',
    clipId: null,
    kind: 'action-point',
  });
}

function expectMotionFocusPlacementRouting(store: ReturnType<typeof createSelectionStore>) {
  store.actions.startMotionFocusPlacement('motion-1');
  store.actions.selectMotionRegion('motion-1');
  expect(store.getState().placementMode).toEqual({
    kind: 'motion-focus',
    motionRegionId: 'motion-1',
  });
  store.actions.selectScene();
  expect(store.getState().placementMode).toBeNull();
}

function expectPlaybackStateClamp(store: ReturnType<typeof createSelectionStore>) {
  store.actions.setCurrentTime(999);
  store.actions.setPixelsPerSecond(1);
  store.actions.togglePlaying();
  expect(store.getState()).toMatchObject({
    currentTime: 0,
    isPlaying: true,
    pixelsPerSecond: 1,
  });
}

function verifyCursorClipAndMotionAreaSelection() {
  const store = createSelectionStore();
  const trackId = seedSelectionProject(store);

  store.actions.selectClip('clip-1');
  expect(store.getState().selection).toEqual({ clipId: 'clip-1', kind: 'clip' });
  expect(store.getState().selectedTrackId).toBe(trackId);
  store.actions.selectCursorSegment('sample-1');
  expect(store.getState().selection).toEqual({ kind: 'cursor-segment', sampleId: 'sample-1' });
  store.actions.startMotionAreaPlacement('motion-1');
  store.actions.selectMotionRegion('motion-1');
  expect(store.getState().placementMode).toEqual({
    kind: 'motion-area',
    motionRegionId: 'motion-1',
  });
}

function seedSelectionProject(store: ReturnType<typeof createSelectionStore>) {
  const project = store.getState().project!;
  const trackId = project.tracks[0]!.id;
  project.clips = [createSeedClip(trackId)] as never;
  project.actionEvents = [createSeedActionEvent()];
  project.cursorTrack = createSeedCursorTrack();
  project.motionRegions = [createSeedMotionRegion()];
  return trackId;
}

function createSeedClip(trackId: string) {
  return {
    assetId: 'asset-1',
    duration: 3,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: 'CONTAIN',
    groupId: null,
    id: 'clip-1',
    linkMode: 'DETACHED',
    muted: false,
    name: 'Clip',
    sourceStart: 0,
    sourceDuration: 3,
    startTime: 1,
    trackId,
    transform: { height: 100, opacity: 1, rotation: 0, width: 100, x: 0, y: 0 },
    transitionIn: 'NONE',
    transitionOut: 'NONE',
    type: 'VIDEO',
    volume: 1,
  };
}

function createSeedActionEvent() {
  return {
    data: {},
    capturedDuration: 0.4,
    id: 'action-1',
    kind: VideoProjectActionEventKind.CLICK,
    label: 'Click',
    point: { x: 20, y: 30 },
    presentation: { preset: VideoProjectActionPreset.CLICK_RIPPLE },
    anchor: { kind: 'project' as const, time: 0.2 },
  };
}

function createSeedCursorTrack(): NonNullable<
  ReturnType<typeof createEmptyVideoProject>['cursorTrack']
> {
  return {
    captureMode: VideoCursorCaptureMode.SEPARATE,
    samples: [{ id: 'sample-1', time: 0.2, visible: true, x: 20, y: 30 }],
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

function createSeedMotionRegion() {
  return {
    duration: 1.2,
    easing: VideoTemporalEasing.EASE_IN_OUT,
    focusArea: { height: 60, width: 90, x: 30, y: 20 },
    focusMode: VideoMotionFocusMode.MANUAL_AREA,
    focusPoint: { x: 75, y: 50 },
    id: 'motion-1',
    scale: 1.4,
    startTime: 0.2,
    targetAction: null,
    zoomInDuration: 0.2,
    zoomOutDuration: 0.2,
  };
}

it('selects the authored Zoom lane without selecting a region or media track', () => {
  const store = createSelectionStore();
  store.actions.selectMotionLane();
  expect(store.getState().selection.kind).toBe('scene');
  const project = store.getState().project!;
  project.motionRegions = [createVideoProjectMotionRegion(project, 0)];
  store.actions.selectTrack(project.tracks[0]!.id);
  store.actions.startMotionAreaPlacement(project.motionRegions[0]!.id);
  store.actions.selectMotionLane();
  expect(store.getState().selection).toEqual({ kind: 'motion-lane' });
  expect(store.getState().selectedTrackId).toBeNull();
  expect(store.getState().placementMode).toBeNull();
  expect(store.getState().project).toBe(project);
});

it('selects only an existing comment document and local entity, clearing placement and media track', () => {
  const store = createSelectionStore();
  const project = store.getState().project!;
  project.commentDocuments = [
    {
      id: 'doc',
      binding: { kind: 'project' },
      annotations: [{ id: 'note', text: '', anchor: { kind: 'point', time: 0 } }],
      canvasComments: [],
    },
  ];
  store.actions.selectTrack(project.tracks[0]!.id);
  const previous = store.getState().selection;
  store.actions.selectComment('missing', 'note');
  expect(store.getState().selection).toBe(previous);
  store.actions.selectComment('doc', 'missing');
  expect(store.getState().selection).toBe(previous);
  store.actions.selectComment('doc', 'note');
  expect(store.getState().selection).toEqual({
    kind: 'comment',
    documentId: 'doc',
    commentId: 'note',
  });
  expect(store.getState().selectedTrackId).toBeNull();
  expect(store.getState().placementMode).toBeNull();
  expect(store.getState().project).toBe(project);
});

it('pauses and seeks to a project note while a dormant source note keeps the current playhead', () => {
  const store = createSelectionStore();
  const state = store.getState();
  const project = state.project!;
  project.duration = 20;
  project.commentDocuments = [
    {
      id: 'project-notes',
      binding: { kind: 'project' },
      canvasComments: [],
      annotations: [{ id: 'note', text: '', anchor: { kind: 'range', start: 12, end: 15 } }],
    },
    {
      id: 'dormant',
      binding: { kind: 'source', assetId: 'retained', sourceInstanceId: 'cut' },
      canvasComments: [],
      annotations: [{ id: 'source-note', text: '', anchor: { kind: 'point', time: 3 } }],
    },
  ];
  state.isPlaying = true;
  state.currentTime = 1;
  store.actions.selectComment('project-notes', 'note');
  expect(store.getState().isPlaying).toBe(false);
  expect(store.getState().currentTime).toBe(12);
  store.actions.selectComment('dormant', 'source-note');
  expect(store.getState().currentTime).toBe(12);
  expect(store.getState().selection).toMatchObject({
    documentId: 'dormant',
    commentId: 'source-note',
  });
  expect(store.getState().project).toBe(project);
});

it('selects the nearest retained source span after cut, rate and independent placements', () => {
  const store = createSelectionStore();
  const project = createVideoProjectFromRecording({
    recordingId: 'notes',
    filename: 'video.webm',
    width: 640,
    height: 360,
    duration: 12,
    mimeType: 'video/webm',
    size: 100,
  });
  const clip = project.clips.find((clip) => clip.type === 'VIDEO')!;
  const sourceInstanceId = clip.sourceInstanceId ?? clip.id;
  project.duration = 30;
  project.clips = [
    {
      ...clip,
      id: 'first',
      sourceInstanceId,
      startTime: 2,
      sourceStart: 0,
      sourceDuration: 3,
      duration: 3,
    },
    {
      ...clip,
      id: 'second',
      sourceInstanceId,
      startTime: 10,
      sourceStart: 6,
      sourceDuration: 4,
      duration: 2,
      playbackRate: 2,
    },
    { ...clip, id: 'independent', sourceInstanceId: 'other', startTime: 20 },
  ];
  project.commentDocuments = [
    {
      id: 'doc',
      binding: { kind: 'source', assetId: clip.assetId, sourceInstanceId },
      canvasComments: [],
      annotations: [{ id: 'note', text: '', anchor: { kind: 'range', start: 1, end: 8 } }],
    },
  ];
  store.getState().project = project;
  store.getState().currentTime = 10.5;
  store.actions.selectComment('doc', 'note');
  expect(store.getState().currentTime).toBe(10);
  store.actions.setCurrentTime(6.6);
  store.actions.selectComment('doc', 'note');
  expect(store.getState().currentTime).toBe(3);
  store.actions.setCurrentTime(0);
  store.actions.selectComment('doc', 'note');
  expect(store.getState().currentTime).toBe(3);
  store.actions.setCurrentTime(0);
  store.actions.selectComment('doc', 'note', 10);
  expect(store.getState().currentTime).toBe(10);
  store.actions.setCurrentTime(0);
  store.actions.selectComment('doc', 'note', 999);
  expect(store.getState().currentTime).toBe(3);
  expect(store.getState().project).toBe(project);
});

it('selects object tracks and preserves the track fallback for missing transitions', () => {
  const store = createSelectionStore();
  const track = store.getState().project!.tracks[0]!.id;
  store.actions.selectTrack(track);
  store.actions.selectObjectTrack('object-track');
  expect(store.getState().selection).toEqual({
    kind: 'object-track',
    objectTrackId: 'object-track',
  });
  expect(store.getState().selectedTrackId).toBe(track);
  store.actions.selectTransition('missing');
  expect(store.getState().selectedTrackId).toBe(track);
});

it('keeps one bound streamed action observation in selection and refuses stale or mismatched selection input', () => {
  const { actions, getState } = createSelectionStore();
  const base = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'source.webm',
    width: 640,
    height: 360,
    duration: 5,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: false,
    recordingSignals: [],
    sourceNormalizedActionEvents: [],
  });
  const events = {
    format: 'recording-events-v1' as const,
    formatVersion: 1 as const,
    algorithm: 'lossless-v1' as const,
    encoding: 'json-utf8-v1' as const,
    eventStreamId: 'a'.repeat(32),
    state: 'incomplete' as const,
    finalized: true,
    totalBlocks: 1000,
    totalRecords: 50000,
    totalBytes: 5000000,
    streamSha256: 'b'.repeat(64),
  };
  const project = applyVideoProjectMutationPatch(base, {
    actionFeedback: base.actionFeedback!.map((group) => ({ ...group, events })),
  });
  const group = project.actionFeedback![0]!;
  const record: Extract<RecordingEventRecord, { kind: 'action' }> = {
    kind: 'action',
    recordSeq: 1,
    segmentId: 0,
    activeTimeUs: 1000000,
    action: {
      id: 'key',
      kind: 'KEY',
      timeUs: 1000000,
      durationUs: 0,
      point: null,
      label: 'Ctrl+S',
      preset: 'NONE',
      data: {
        downTimeUs: null,
        upTimeUs: 1000000,
        pressDurationUs: null,
        lastObservedTimeUs: 1000000,
        repeatCount: 0,
        completion: 'released',
        keyboardAttackId: null,
        keyboardOnsetTimeUs: null,
        groupId: null,
        continuationOf: null,
        ctrlKey: true,
        altKey: null,
        shiftKey: false,
        metaKey: null,
      },
    },
  };
  const event = projectRecordingEventAction(group, record);
  getState().project = project;
  const clip = project.clips.find((clip) => clip.type === 'VIDEO')!;
  const observation = {
    recordingId: group.recordingId,
    sourceInstanceId: group.sourceInstanceId,
    eventStreamId: events.eventStreamId,
    streamSha256: events.streamSha256,
    record,
  };
  actions.selectActionOccurrence(event.id, clip.id, observation);
  expect(getState().selection).toMatchObject({
    kind: 'action-occurrence',
    eventId: event.id,
    observedAction: { record },
  });
  const selected = getState().selection;
  record.action.label = 'Changed after selection';
  expect(
    selected.kind === 'action-occurrence' && selected.observedAction?.record.action.label
  ).toBe('Ctrl+S');
  actions.selectActionOccurrence('another-event', clip.id, observation);
  expect(getState().selection).toBe(selected);
  actions.selectActionOccurrence(event.id, clip.id, {
    ...observation,
    streamSha256: 'c'.repeat(64),
  });
  expect(getState().selection).toBe(selected);
  actions.selectActionOccurrence(event.id, 'missing-clip', observation);
  expect(getState().selection).toBe(selected);
  expect(getState().project).toBe(project);
  expect(project.actionEvents).toEqual([]);
});
