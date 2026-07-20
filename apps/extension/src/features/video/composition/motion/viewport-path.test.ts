import { expect, it } from 'vitest';
import { createDefaultMotionPath } from '../../project/motion/path';
import { createEmptyVideoProject } from '../../project/factories/creation';
import {
  VideoMotionCameraMode,
  VideoMotionFocusMode,
  VideoMotionOverlayZoomMode,
  VideoMotionPathTrajectoryPreset,
  VideoTemporalEasing,
  type VideoProjectMotionRegion,
} from '../../project/types/index';
import { resolveVideoCompositionCamera } from './index';

it('animates camera pan toward the final viewport path instead of axis-stepping per shrink frame', () => {
  const project = createEmptyVideoProject('Camera path', 1000, 800);
  project.motionRegions = [
    {
      duration: 2,
      easing: VideoTemporalEasing.LINEAR,
      focusMode: VideoMotionFocusMode.MANUAL,
      focusPoint: { x: 900, y: 700 },
      id: 'motion-cinematic',
      motionBlurAmount: 0,
      overlayZoomMode: VideoMotionOverlayZoomMode.FOLLOW_CAMERA,
      scale: 2,
      startTime: 1,
      targetActionEventId: null,
      zoomInDuration: 1,
      zoomOutDuration: 1,
    },
  ];

  expect(
    resolveVideoCompositionCamera({
      actions: [],
      cursorSample: null,
      currentTime: 1.5,
      project,
    })
  ).toEqual(
    expect.objectContaining({
      overlayZoomMode: VideoMotionOverlayZoomMode.FOLLOW_CAMERA,
      scale: 1.5,
      viewportHeight: expect.closeTo(533.3333333333, 8),
      viewportWidth: expect.closeTo(666.6666666667, 8),
      viewportX: 250,
      viewportY: 200,
    })
  );
});

it('keeps zoom active while the camera travels between path stops', () => {
  const project = createMovingZoomTravelProject();

  const camera = resolveVideoCompositionCamera({
    actions: [],
    cursorSample: null,
    currentTime: 3.2,
    project,
  });

  expect(camera).toEqual(
    expect.objectContaining({
      motionBlurAmount: 0.2,
      overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
      regionId: 'motion-path',
    })
  );
  expect(camera.scale).toBeGreaterThan(2);
  expect(camera.scale).toBeLessThan(4);
  expect(camera.viewportX).toBeGreaterThan(150);
  expect(camera.viewportY).toBeGreaterThan(50);
  expect(camera.viewportX).toBeLessThan(620);
  expect(camera.viewportY).toBeLessThan(430);
});

it('falls back to a default two-stop path when moving zoom data is missing', () => {
  const project = createEmptyVideoProject('Moving zoom fallback', 1200, 800);
  const defaultPath = createDefaultMotionPath(project, {
    focusArea: null,
    focusMode: VideoMotionFocusMode.MANUAL,
    focusPoint: { x: 900, y: 600 },
    scale: 2,
  });
  project.motionRegions = [
    {
      cameraMode: VideoMotionCameraMode.PATH,
      duration: 4,
      easing: VideoTemporalEasing.LINEAR,
      focusMode: VideoMotionFocusMode.MANUAL,
      focusPoint: { x: 900, y: 600 },
      id: 'motion-fallback',
      motionBlurAmount: 0,
      overlayZoomMode: VideoMotionOverlayZoomMode.FOLLOW_CAMERA,
      path: null,
      scale: 2,
      startTime: 0,
      targetActionEventId: null,
      zoomInDuration: 1,
      zoomOutDuration: 1,
    },
  ];

  const camera = resolveVideoCompositionCamera({
    actions: [],
    cursorSample: null,
    currentTime: 2,
    project,
  });

  expect(defaultPath.stops).toHaveLength(2);
  expect(camera).toEqual(
    expect.objectContaining({
      overlayZoomMode: VideoMotionOverlayZoomMode.FOLLOW_CAMERA,
      regionId: 'motion-fallback',
      scale: 2,
      viewportX: 600,
      viewportY: 400,
    })
  );
});

it('derives camera zoom from a manual focus area instead of point scale', () => {
  const project = createEmptyVideoProject('Manual area', 1200, 800);
  project.motionRegions = [
    {
      duration: 3,
      easing: VideoTemporalEasing.LINEAR,
      focusArea: { x: 300, y: 200, width: 240, height: 160 },
      focusMode: VideoMotionFocusMode.MANUAL_AREA,
      focusPoint: { x: 420, y: 280 },
      id: 'motion-area',
      motionBlurAmount: 0,
      scale: 1.2,
      startTime: 0,
      targetActionEventId: null,
      zoomInDuration: 0,
      zoomOutDuration: 0,
    },
  ];

  expect(
    resolveVideoCompositionCamera({
      actions: [],
      cursorSample: null,
      currentTime: 0.5,
      project,
    })
  ).toEqual(
    expect.objectContaining({
      focusPoint: { x: 420, y: 280 },
      regionId: 'motion-area',
      scale: 4,
      viewportHeight: 200,
      viewportWidth: 300,
    })
  );
});

function createMovingZoomTravelProject() {
  const project = createEmptyVideoProject('Moving zoom', 1000, 800);
  project.motionRegions = [createMovingZoomTravelRegion()];
  return project;
}

function createMovingZoomTravelRegion(): VideoProjectMotionRegion {
  return {
    cameraMode: VideoMotionCameraMode.PATH,
    duration: 5,
    easing: VideoTemporalEasing.EASE_IN_OUT,
    focusMode: VideoMotionFocusMode.MANUAL,
    focusPoint: { x: 250, y: 250 },
    id: 'motion-path',
    motionBlurAmount: 0.2,
    overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
    path: {
      segments: [
        {
          durationWeight: 1,
          easing: VideoTemporalEasing.LINEAR,
          trajectoryPreset: VideoMotionPathTrajectoryPreset.LINEAR,
        },
        {
          durationWeight: 1,
          easing: VideoTemporalEasing.EASE_OUT,
          trajectoryPreset: VideoMotionPathTrajectoryPreset.SOFT_ARC,
        },
      ],
      stops: [
        { id: 'stop-1', offset: 0, target: { kind: 'POINT', scale: 2, x: 250, y: 250 } },
        { id: 'stop-2', offset: 0.5, target: { kind: 'POINT', scale: 2.4, x: 650, y: 250 } },
        {
          id: 'stop-3',
          offset: 1,
          target: { height: 180, kind: 'AREA', width: 220, x: 620, y: 430 },
        },
      ],
    },
    scale: 2,
    startTime: 1,
    targetActionEventId: null,
    zoomInDuration: 0.6,
    zoomOutDuration: 0.8,
  };
}
