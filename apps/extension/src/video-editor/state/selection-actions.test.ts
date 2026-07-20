import { describe, expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../features/video/project/factories/creation';
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
    diagnosticsOpen: false,
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
    selectedClipId: null,
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

  it('stores moving-zoom stop placement ownership under the motion selection seam', () => {
    const store = createSelectionStore();

    store.actions.startMotionPathStopPointPlacement('motion-1', 'stop-1');
    store.actions.selectMotionRegion('motion-1');
    expect(store.getState().placementMode).toEqual({
      kind: 'motion-path-stop-point',
      motionRegionId: 'motion-1',
      stopId: 'stop-1',
    });

    store.actions.startMotionPathStopAreaPlacement('motion-1', 'stop-2');
    expect(store.getState().placementMode).toEqual({
      kind: 'motion-path-stop-area',
      motionRegionId: 'motion-1',
      stopId: 'stop-2',
    });
  });

  it('does not start utility lane placements when the lane is locked', () => {
    const store = createSelectionStore();
    store.getState().project!.utilityLanes = {
      actions: { visible: true, locked: true },
      camera: { visible: true, locked: true },
    };

    store.actions.startActionPointPlacement('action-1');
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
  store.actions.startActionPointPlacement('action-1');
  store.actions.selectActionSegment('action-1');
  expect(store.getState().placementMode).toEqual({
    actionEventId: 'action-1',
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
  store.actions.setDiagnosticsOpen(true);
  expect(store.getState()).toMatchObject({
    currentTime: 0,
    diagnosticsOpen: true,
    isPlaying: true,
    pixelsPerSecond: 12,
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
    duration: 0.4,
    id: 'action-1',
    kind: VideoProjectActionEventKind.CLICK,
    label: 'Click',
    point: { x: 20, y: 30 },
    preset: VideoProjectActionPreset.CLICK_RIPPLE,
    time: 0.2,
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
    targetActionEventId: null,
    zoomInDuration: 0.2,
    zoomOutDuration: 0.2,
  };
}
