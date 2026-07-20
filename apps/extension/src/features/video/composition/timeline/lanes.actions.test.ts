import { describe, expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../project/factories/creation';
import {
  VideoCursorCaptureMode,
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  VideoTemporalEasing,
  VideoTransitionEasing,
  VideoTransitionKind,
} from '../../project/types/index';
import {
  buildVideoCompositionActionSegments,
  buildVideoCompositionCursorSegments,
  buildVideoCompositionMotionSegments,
  buildVideoCompositionTransitionSegments,
} from './lanes';

function createLaneCursorTrack() {
  return {
    captureMode: VideoCursorCaptureMode.SEPARATE,
    samples: [
      { id: 'cursor-1', time: 1, visible: true, x: 0, y: 0 },
      { id: 'cursor-2', time: 2, visible: true, x: 10, y: 10 },
      { id: 'cursor-3', time: 2, visible: true, x: 20, y: 20 },
      { id: 'cursor-4', time: 3, visible: false, x: 30, y: 30 },
    ],
    skin: null,
  } as never;
}

function createLaneMotionRegions() {
  return [
    {
      duration: 1.5,
      easing: VideoTemporalEasing.EASE_IN_OUT,
      focusMode: 'MANUAL',
      focusPoint: { x: 100, y: 100 },
      id: 'motion-1',
      scale: 1.5,
      startTime: 0.5,
      targetActionEventId: null,
      zoomInDuration: 0.2,
      zoomOutDuration: 0.2,
    },
    {
      duration: 0,
      easing: VideoTemporalEasing.EASE_IN_OUT,
      focusMode: 'MANUAL',
      focusPoint: { x: 100, y: 100 },
      id: 'motion-zero',
      scale: 1.2,
      startTime: 2,
      targetActionEventId: null,
      zoomInDuration: 0.2,
      zoomOutDuration: 0.2,
    },
  ] as never;
}

function createLaneActionEvents() {
  return [
    {
      data: {},
      duration: 0,
      id: 'legacy-scroll',
      kind: VideoProjectActionEventKind.SCROLL,
      label: 'Legacy scroll',
      point: null,
      preset: VideoProjectActionPreset.SCROLL_EMPHASIS,
      time: 1.5,
    },
    {
      data: {},
      duration: 0,
      id: 'click-1',
      kind: VideoProjectActionEventKind.CLICK,
      label: 'Click',
      point: { x: 110, y: 160 },
      preset: VideoProjectActionPreset.CLICK_RIPPLE,
      time: 3,
    },
  ];
}

function createLaneProject() {
  const project = createEmptyVideoProject('Action lanes');
  project.duration = 6;
  project.clips = [
    { id: 'clip-a', duration: 3, startTime: 0 } as never,
    { id: 'clip-b', duration: 2, startTime: 2 } as never,
  ];
  project.transitions = [
    {
      duration: 1,
      easing: VideoTransitionEasing.LINEAR,
      id: 'transition-1',
      kind: VideoTransitionKind.CROSSFADE,
      leadingClipId: 'clip-a',
      trailingClipId: 'clip-b',
    },
  ];
  project.cursorTrack = createLaneCursorTrack();
  project.motionRegions = createLaneMotionRegions();
  project.actionEvents = createLaneActionEvents();
  return project;
}

function verifyTransitionAndCursorLanes() {
  const project = createLaneProject();

  expect(buildVideoCompositionTransitionSegments(project)).toEqual([
    expect.objectContaining({
      end: 3,
      id: 'transition-1',
      start: 2,
    }),
  ]);
  expect(buildVideoCompositionCursorSegments(project)).toEqual([
    {
      end: 3,
      id: 'cursor-1',
      sampleIds: ['cursor-1', 'cursor-3'],
      start: 1,
      visible: true,
    },
    {
      end: 6,
      id: 'cursor-4',
      sampleIds: ['cursor-4'],
      start: 3,
      visible: false,
    },
  ]);
}

function verifyActionAndMotionLanes() {
  const project = createLaneProject();

  expect(buildVideoCompositionActionSegments(project)).toEqual([
    expect.objectContaining({
      end: 3.7,
      id: 'click-1',
      start: 3,
    }),
  ]);
  expect(buildVideoCompositionMotionSegments(project)).toEqual([
    expect.objectContaining({
      end: 2,
      id: 'motion-1',
      start: 0.5,
    }),
  ]);
}

function verifyEmptyAndInvalidLaneBranches() {
  const project = createLaneProject();
  project.transitions = [
    {
      duration: 1,
      easing: VideoTransitionEasing.LINEAR,
      id: 'missing-transition',
      kind: VideoTransitionKind.CROSSFADE,
      leadingClipId: 'missing-a',
      trailingClipId: 'missing-b',
    },
  ];
  project.cursorTrack = null;
  project.actionEvents = [];
  project.motionRegions = [];

  expect(buildVideoCompositionTransitionSegments(project)).toEqual([]);
  expect(buildVideoCompositionCursorSegments(project)).toEqual([]);
  expect(buildVideoCompositionActionSegments(project)).toEqual([]);
  expect(buildVideoCompositionMotionSegments(project)).toEqual([]);
}

describe('video composition lanes', () => {
  it('builds transition and merged cursor segments', verifyTransitionAndCursorLanes);
  it('filters legacy scroll actions and zero-length motion regions', verifyActionAndMotionLanes);
  it(
    'returns empty lane output for missing or empty temporal owners',
    verifyEmptyAndInvalidLaneBranches
  );
});
