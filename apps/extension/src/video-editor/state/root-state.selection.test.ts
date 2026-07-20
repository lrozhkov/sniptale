import { describe, expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../features/video/project/factories/creation';
import {
  createActionPointPlacementMode,
  createMotionAreaPlacementMode,
  createMotionFocusPlacementMode,
} from '../project/selection/placement';
import {
  VideoMotionFocusMode,
  VideoCursorCaptureMode,
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  VideoTemporalEasing,
  VideoTransitionEasing,
  VideoTransitionKind,
} from '../../features/video/project/types';
import { createVideoEditorTimelineState } from './root-state';
import type { VideoEditorState } from './types';

function createRecordedTimelineState() {
  let state = {} as VideoEditorState;
  const set: Parameters<typeof createVideoEditorTimelineState>[0] = (partial) => {
    const nextState = typeof partial === 'function' ? partial(state as never) : partial;
    state = { ...state, ...nextState };
  };

  state = createVideoEditorTimelineState(set) as VideoEditorState;
  return { getState: () => state };
}

function createSelectionProject() {
  const project = createEmptyVideoProject('Demo');
  populateSelectionTracks(project);
  populateSelectionEffects(project);

  return project;
}

function populateSelectionTracks(project: ReturnType<typeof createEmptyVideoProject>) {
  const [primaryTrack] = project.tracks;
  project.clips = [
    createImageSelectionClip('video-1', primaryTrack!.id, 0, 'asset-a'),
    createImageSelectionClip('video-2', primaryTrack!.id, 2, 'asset-b'),
  ];
  project.transitions = [
    {
      duration: 1,
      easing: VideoTransitionEasing.LINEAR,
      id: 'transition-1',
      kind: VideoTransitionKind.CROSSFADE,
      leadingClipId: 'video-1',
      trailingClipId: 'video-2',
    },
  ];
}

function populateSelectionEffects(project: ReturnType<typeof createEmptyVideoProject>) {
  project.cursorTrack = {
    captureMode: VideoCursorCaptureMode.SEPARATE,
    samples: [{ id: 'sample-1', time: 0.2, visible: true, x: 10, y: 20 }],
    skin: {
      animationPreset: 'NONE',
      color: '#fff',
      hidden: false,
      preset: 'ARROW',
      scale: 1,
      shadow: true,
    },
  };
  project.actionEvents = [
    {
      data: {},
      duration: 0.4,
      id: 'action-1',
      kind: VideoProjectActionEventKind.CLICK,
      label: 'Click',
      point: { x: 10, y: 20 },
      preset: VideoProjectActionPreset.CLICK_RIPPLE,
      time: 0.2,
    },
  ];
  project.motionRegions = [
    {
      duration: 1.2,
      easing: VideoTemporalEasing.EASE_IN_OUT,
      focusArea: { x: 30, y: 20, width: 90, height: 70 },
      focusMode: VideoMotionFocusMode.MANUAL,
      focusPoint: { x: 80, y: 60 },
      id: 'motion-1',
      scale: 1.6,
      startTime: 0.1,
      targetActionEventId: null,
      zoomInDuration: 0.2,
      zoomOutDuration: 0.2,
    },
  ];
  project.objectTracks = [
    {
      id: 'visual-cursor',
      kind: 'visualCursor',
      samples: [{ confidence: 0.9, time: 0.2, visible: true, x: 10, y: 20 }],
      source: 'visualDetection',
    },
  ];
}

function createImageSelectionClip(id: string, trackId: string, startTime: number, assetId: string) {
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

describe('video editor timeline selection state', () => {
  it('switches selection ownership for transition, cursor, action, and motion segments', () => {
    const timeline = createRecordedTimelineState();
    const project = createSelectionProject();
    const [primaryTrack] = project.tracks;

    timeline.getState().setProject(project);
    timeline.getState().selectTransition('transition-1');
    expect(timeline.getState().selection).toEqual({
      kind: 'transition-junction',
      transitionId: 'transition-1',
    });
    expect(timeline.getState().selectedTrackId).toBe(primaryTrack!.id);

    timeline.getState().selectCursorSegment('sample-1');
    expect(timeline.getState().selection).toEqual({
      kind: 'cursor-segment',
      sampleId: 'sample-1',
    });

    timeline.getState().selectActionSegment('action-1');
    expect(timeline.getState().selection).toEqual({
      actionEventId: 'action-1',
      kind: 'action-segment',
    });

    timeline.getState().selectMotionRegion('motion-1');
    expect(timeline.getState().selection).toEqual({
      kind: 'motion-region',
      motionRegionId: 'motion-1',
    });
  });

  it('selects detected object tracks as follow targets', () => {
    const timeline = createRecordedTimelineState();
    timeline.getState().setProject(createSelectionProject());

    timeline.getState().selectObjectTrack('visual-cursor');

    expect(timeline.getState().selection).toEqual({
      kind: 'object-track',
      objectTrackId: 'visual-cursor',
    });
  });
});

describe('video editor timeline scene selection state', () => {
  it('covers scene and null-selection branches for track and clip actions', () => {
    const timeline = createRecordedTimelineState();
    timeline.getState().setProject(createSelectionProject());

    timeline.getState().selectTrack(null);
    expect(timeline.getState().selection).toEqual({ kind: 'scene' });
    timeline.getState().selectClip(null);
    expect(timeline.getState().selection).toEqual({ kind: 'scene' });
    timeline.getState().selectScene();
    expect(timeline.getState().selection).toEqual({ kind: 'scene' });
  });

  it(
    'keeps and clears placement mode along the matching selection path',
    verifyPlacementModeRouting
  );
});

function verifyPlacementModeRouting() {
  const timeline = createRecordedTimelineState();
  timeline.getState().setProject(createSelectionProject());

  expectActionPlacementLifecycle(timeline);
  expectMotionPlacementLifecycle(timeline);
}

function expectActionPlacementLifecycle(timeline: ReturnType<typeof createRecordedTimelineState>) {
  timeline.getState().selectActionSegment('action-1');
  timeline.getState().startActionPointPlacement('action-1');
  expect(timeline.getState().placementMode).toEqual(createActionPointPlacementMode('action-1'));

  timeline.getState().selectActionSegment('action-1');
  expect(timeline.getState().placementMode).toEqual(createActionPointPlacementMode('action-1'));

  timeline.getState().selectScene();
  expect(timeline.getState().placementMode).toBeNull();
}

function expectMotionPlacementLifecycle(timeline: ReturnType<typeof createRecordedTimelineState>) {
  timeline.getState().selectMotionRegion('motion-1');
  timeline.getState().startMotionFocusPlacement('motion-1');
  expect(timeline.getState().placementMode).toEqual(createMotionFocusPlacementMode('motion-1'));

  timeline.getState().selectMotionRegion('motion-1');
  expect(timeline.getState().placementMode).toEqual(createMotionFocusPlacementMode('motion-1'));

  timeline.getState().clearPlacementMode();
  expect(timeline.getState().placementMode).toBeNull();

  timeline.getState().updateProject((project) => ({
    ...project,
    motionRegions: (project.motionRegions ?? []).map((region) => ({
      ...region,
      focusMode: VideoMotionFocusMode.MANUAL_AREA,
    })),
  }));
  timeline.getState().startMotionAreaPlacement('motion-1');
  expect(timeline.getState().placementMode).toEqual(createMotionAreaPlacementMode('motion-1'));
}
