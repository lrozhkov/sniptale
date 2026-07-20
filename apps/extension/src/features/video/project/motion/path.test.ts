import { expect, it } from 'vitest';
import {
  createDefaultMotionPath,
  createDefaultMotionPathStop,
  deriveMotionPathStopOffsets,
  normalizeVideoProjectMotionPath,
} from './path';
import {
  VideoMotionFocusMode,
  VideoMotionPathTrajectoryPreset,
  VideoTemporalEasing,
  type VideoProjectMotionPath,
} from '../types/index';

const project = { height: 600, width: 800 };

it('creates default stops from the current manual point or area target', () => {
  expect(
    createDefaultMotionPathStop(
      project,
      {
        focusArea: null,
        focusMode: VideoMotionFocusMode.MANUAL,
        focusPoint: { x: 320, y: 240 },
        scale: 1.8,
      },
      0.25,
      'point-stop-0000-0000-0000-000000000000'
    )
  ).toEqual({
    id: 'point-stop-0000-0000-0000-000000000000',
    offset: 0.25,
    target: { kind: 'POINT', scale: 1.8, x: 320, y: 240 },
  });

  expect(
    createDefaultMotionPathStop(
      project,
      {
        focusArea: { height: 140, width: 220, x: 100, y: 120 },
        focusMode: VideoMotionFocusMode.MANUAL_AREA,
        focusPoint: null,
        scale: 2,
      },
      0.75,
      'area-stop-0000-0000-0000-000000000000'
    )
  ).toEqual({
    id: 'area-stop-0000-0000-0000-000000000000',
    offset: 0.75,
    target: { height: 140, kind: 'AREA', width: 220, x: 100, y: 120 },
  });
});

it('creates a default two-stop path and derives normalized offsets from segment weights', () => {
  const path = createDefaultMotionPath(project, {
    focusArea: null,
    focusMode: VideoMotionFocusMode.MANUAL,
    focusPoint: { x: 400, y: 300 },
    scale: 2,
  });

  expect(path.stops).toHaveLength(2);
  expect(path.segments).toEqual([
    {
      durationWeight: 1,
      easing: VideoTemporalEasing.EASE_IN_OUT,
      trajectoryPreset: VideoMotionPathTrajectoryPreset.LINEAR,
    },
  ]);
  expect(deriveMotionPathStopOffsets([])).toEqual([0, 1]);
  expect(
    deriveMotionPathStopOffsets([
      { durationWeight: 1 },
      { durationWeight: 3 },
      { durationWeight: 2 },
    ])
  ).toEqual([0, 1 / 6, 4 / 6, 1]);
});

it('normalizes path stops and segments back into canonical bounds', () => {
  expect(
    normalizeVideoProjectMotionPath(project, createInvalidMotionPath(), createMotionPathDefaults())
  ).toEqual(createExpectedNormalizedMotionPath());
});

function createMotionPathDefaults() {
  return {
    focusArea: null,
    focusMode: VideoMotionFocusMode.MANUAL,
    focusPoint: { x: 200, y: 100 },
    scale: 1.5,
  };
}

function createInvalidMotionPath(): VideoProjectMotionPath {
  return {
    segments: [
      {
        durationWeight: Number.NaN,
        easing: 'bad' as never,
        trajectoryPreset: 'bad' as never,
      },
      {
        durationWeight: 4,
        easing: VideoTemporalEasing.LINEAR,
        trajectoryPreset: VideoMotionPathTrajectoryPreset.SOFT_ARC,
      },
    ],
    stops: [
      null as never,
      {
        id: 'stop-3',
        offset: 0.4,
        target: { kind: 'POINT', scale: 0.25, x: 120, y: 900 },
      },
      {
        id: 'stop-2',
        offset: -1,
        target: { height: 12, kind: 'AREA', width: 1200, x: -20, y: 999 },
      },
    ],
  };
}

function createExpectedNormalizedMotionPath() {
  return {
    segments: [
      {
        durationWeight: 1,
        easing: VideoTemporalEasing.EASE_IN_OUT,
        trajectoryPreset: VideoMotionPathTrajectoryPreset.LINEAR,
      },
      {
        durationWeight: 4,
        easing: VideoTemporalEasing.LINEAR,
        trajectoryPreset: VideoMotionPathTrajectoryPreset.SOFT_ARC,
      },
    ],
    stops: [
      {
        id: expect.any(String),
        offset: 0,
        target: { kind: 'POINT', scale: 1.5, x: 200, y: 100 },
      },
      {
        id: 'stop-2',
        offset: 0,
        target: { height: 48, kind: 'AREA', width: 800, x: 0, y: 552 },
      },
      {
        id: 'stop-3',
        offset: 1,
        target: { kind: 'POINT', scale: 1, x: 120, y: 600 },
      },
    ],
  };
}
