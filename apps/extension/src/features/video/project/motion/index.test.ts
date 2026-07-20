import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../factories/creation';
import { createVideoProjectMotionRegion, normalizeVideoProjectMotionRegion } from './index';
import { createMotionFocusAreaFromPointScale } from './index';
import {
  VideoMotionFocusMode,
  VideoMotionCameraMode,
  VideoMotionOverlayZoomMode,
  VideoMotionPathTrajectoryPreset,
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  VideoTemporalEasing,
} from '../types/index';

it('creates a default motion region centered on the project', () => {
  const project = createEmptyVideoProject('Motion', 1920, 1080);
  const region = createVideoProjectMotionRegion(project, -2);

  expect(region).toEqual(
    expect.objectContaining({
      cameraMode: VideoMotionCameraMode.STATIC,
      duration: 2.8,
      easing: VideoTemporalEasing.EASE_IN_OUT,
      focusMode: VideoMotionFocusMode.MANUAL,
      focusPoint: { x: 960, y: 540 },
      motionBlurAmount: 0,
      overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
      path: null,
      scale: 1.35,
      startTime: 0,
      targetActionEventId: null,
    })
  );
});

function createMotionNormalizationProject() {
  const project = createEmptyVideoProject('Motion', 800, 600);
  project.duration = 5;
  project.actionEvents = [
    {
      data: {},
      duration: 0.5,
      id: 'action-1',
      kind: VideoProjectActionEventKind.CLICK,
      label: 'Action',
      point: { x: 100, y: 200 },
      preset: VideoProjectActionPreset.CLICK_RIPPLE,
      time: 1,
    },
  ];
  return project;
}

it('normalizes invalid motion region bounds, focus, and overlay zoom mode', () => {
  const project = createMotionNormalizationProject();
  const region = normalizeVideoProjectMotionRegion(project, {
    duration: Number.POSITIVE_INFINITY,
    easing: 'bad' as never,
    focusMode: 'bad' as never,
    focusPoint: { x: -100, y: 9999 },
    id: 'motion-1',
    motionBlurAmount: Number.POSITIVE_INFINITY,
    overlayZoomMode: 'bad' as never,
    scale: 9,
    startTime: 10,
    targetActionEventId: 'missing',
    zoomInDuration: Number.NaN,
    zoomOutDuration: 99,
  });

  expect(region).toEqual({
    cameraMode: VideoMotionCameraMode.STATIC,
    duration: 0.1,
    easing: VideoTemporalEasing.EASE_IN_OUT,
    focusArea: null,
    focusMode: VideoMotionFocusMode.MANUAL,
    focusPoint: { x: 0, y: 600 },
    id: 'motion-1',
    motionBlurAmount: 0,
    overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
    path: null,
    scale: 4,
    startTime: 4.9,
    targetActionEventId: null,
    zoomInDuration: 0,
    zoomOutDuration: 0.1,
  });
});

it('keeps valid target action ownership and overlay zoom mode during normalization', () => {
  const project = createMotionNormalizationProject();
  const region = normalizeVideoProjectMotionRegion(project, {
    ...createVideoProjectMotionRegion(project, 0.5),
    targetActionEventId: 'action-1',
  });

  expect(
    normalizeVideoProjectMotionRegion(project, {
      ...region,
      focusMode: VideoMotionFocusMode.ACTION,
      overlayZoomMode: VideoMotionOverlayZoomMode.FOLLOW_CAMERA,
      targetActionEventId: 'action-1',
    })
  ).toEqual(
    expect.objectContaining({
      overlayZoomMode: VideoMotionOverlayZoomMode.FOLLOW_CAMERA,
      targetActionEventId: 'action-1',
    })
  );
});

it('normalizes moving zoom path stops and segments into canonical bounds', () => {
  const project = createMotionNormalizationProject();

  expect(
    normalizeVideoProjectMotionRegion(project, createInvalidMovingZoomRegion(project))
  ).toEqual(expect.objectContaining(createExpectedNormalizedMovingZoomRegion()));
});

it('creates and normalizes manual focus areas inside the project bounds', () => {
  const project = createEmptyVideoProject('Motion area', 800, 600);

  expect(createMotionFocusAreaFromPointScale(project, { x: 760, y: 570 }, 2)).toEqual({
    height: 300,
    width: 400,
    x: 400,
    y: 300,
  });
  expect(createMotionFocusAreaFromPointScale(project, { x: 50, y: 40 }, 20)).toEqual({
    height: 150,
    width: 200,
    x: 0,
    y: 0,
  });

  expect(
    normalizeVideoProjectMotionRegion(project, {
      ...createVideoProjectMotionRegion(project, 1),
      focusArea: { x: -50, y: 900, width: 900, height: 20 },
      focusMode: VideoMotionFocusMode.MANUAL_AREA,
    })
  ).toEqual(
    expect.objectContaining({
      focusArea: {
        height: 48,
        width: 800,
        x: 0,
        y: 552,
      },
      focusMode: VideoMotionFocusMode.MANUAL_AREA,
    })
  );
});

function createInvalidMovingZoomRegion(
  project: ReturnType<typeof createMotionNormalizationProject>
) {
  return {
    ...createVideoProjectMotionRegion(project, 0.5),
    cameraMode: VideoMotionCameraMode.PATH,
    path: {
      segments: [
        {
          durationWeight: Number.NaN,
          easing: 'bad' as never,
          trajectoryPreset: 'bad' as never,
        },
        {
          durationWeight: 3,
          easing: VideoTemporalEasing.LINEAR,
          trajectoryPreset: VideoMotionPathTrajectoryPreset.SOFT_ARC,
        },
      ],
      stops: [
        { id: 'stop-b', offset: 2, target: { kind: 'POINT' as const, scale: 8, x: 900, y: -50 } },
        {
          id: 'stop-a',
          offset: -1,
          target: { height: 20, kind: 'AREA' as const, width: 1200, x: -20, y: 999 },
        },
        {
          id: 'stop-c',
          offset: 0.3,
          target: { kind: 'POINT' as const, scale: 0.2, x: 120, y: 300 },
        },
      ],
    },
  };
}

function createExpectedNormalizedMovingZoomRegion() {
  return {
    cameraMode: VideoMotionCameraMode.PATH,
    path: {
      segments: [
        {
          durationWeight: 1,
          easing: VideoTemporalEasing.EASE_IN_OUT,
          trajectoryPreset: VideoMotionPathTrajectoryPreset.LINEAR,
        },
        {
          durationWeight: 3,
          easing: VideoTemporalEasing.LINEAR,
          trajectoryPreset: VideoMotionPathTrajectoryPreset.SOFT_ARC,
        },
      ],
      stops: [
        {
          id: 'stop-a',
          offset: 0,
          target: { height: 48, kind: 'AREA', width: 800, x: 0, y: 552 },
        },
        {
          id: 'stop-c',
          offset: 0.3,
          target: { kind: 'POINT', scale: 1, x: 120, y: 300 },
        },
        {
          id: 'stop-b',
          offset: 1,
          target: { kind: 'POINT', scale: 4, x: 800, y: 0 },
        },
      ],
    },
  };
}
