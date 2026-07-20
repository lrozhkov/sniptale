import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../project/factories/creation';
import {
  VideoMotionFocusMode,
  VideoMotionOverlayZoomMode,
  VideoMotionPathTrajectoryPreset,
  VideoTemporalEasing,
  type VideoProjectMotionRegion,
} from '../../project/types/index';
import { resolvePathTravelCamera } from './path';

function createPathProject() {
  return createEmptyVideoProject('Moving zoom', 1200, 800);
}

function createPathRegion(): VideoProjectMotionRegion {
  return {
    duration: 4,
    easing: VideoTemporalEasing.LINEAR,
    focusMode: VideoMotionFocusMode.MANUAL,
    focusPoint: { x: 800, y: 500 },
    id: 'motion-path',
    motionBlurAmount: 0.4,
    overlayZoomMode: VideoMotionOverlayZoomMode.FOLLOW_CAMERA,
    path: {
      segments: [
        {
          durationWeight: 1,
          easing: VideoTemporalEasing.LINEAR,
          trajectoryPreset: VideoMotionPathTrajectoryPreset.LINEAR,
        },
      ],
      stops: [
        {
          id: 'stop-1',
          offset: 0,
          target: { kind: 'POINT', scale: 2, x: 800, y: 500 },
        },
        {
          id: 'stop-2',
          offset: 1,
          target: { kind: 'POINT', scale: 2.5, x: 900, y: 550 },
        },
      ],
    },
    scale: 2,
    startTime: 1,
    targetActionEventId: null,
    zoomInDuration: 1,
    zoomOutDuration: 1,
  };
}

it('falls back to the full-frame camera when the moving path has no valid stops', () => {
  const project = createPathProject();

  expect(
    resolvePathTravelCamera({
      currentTime: 2,
      project,
      region: { ...createPathRegion(), path: { segments: [], stops: [] } },
    })
  ).toEqual({
    focusPoint: { x: 600, y: 400 },
    motionBlurAmount: 0,
    overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
    regionId: null,
    scale: 1,
    viewportHeight: 800,
    viewportWidth: 1200,
    viewportX: 0,
    viewportY: 0,
  });
});

it('interpolates the intro phase from the project center into the first stop', () => {
  const camera = resolvePathTravelCamera({
    currentTime: 1.5,
    project: createPathProject(),
    region: createPathRegion(),
  });

  expect(camera.scale).toBe(1.5);
  expect(camera.focusPoint).toEqual({ x: 700, y: 450 });
  expect(camera.viewportX).toBe(250);
  expect(camera.viewportY).toBe(150);
});

it('interpolates the outro phase back out from the last stop', () => {
  const camera = resolvePathTravelCamera({
    currentTime: 4.5,
    project: createPathProject(),
    region: createPathRegion(),
  });

  expect(camera.scale).toBe(1.75);
  expect(camera.focusPoint).toEqual({ x: 900, y: 550 });
  expect(camera.viewportX).toBe(330);
  expect(camera.viewportY).toBe(195);
});

it('holds the first stop when the travel window collapses', () => {
  const project = createPathProject();
  const region = createPathRegion();
  const firstStop = region.path?.stops[0];
  const camera = resolvePathTravelCamera({
    currentTime: 1.6,
    project,
    region: {
      ...region,
      duration: 1,
      path: { segments: [], stops: firstStop ? [firstStop] : [] },
      zoomInDuration: 0.6,
      zoomOutDuration: 0.6,
    },
  });

  expect(camera.focusPoint).toEqual({ x: 800, y: 500 });
  expect(camera.regionId).toBe('motion-path');
  expect(camera.scale).toBeCloseTo(2, 10);
  expect(camera.viewportX).toBeCloseTo(500, 10);
  expect(camera.viewportY).toBeCloseTo(300, 10);
});

it('uses instant easing to snap into the first stop during intro', () => {
  const camera = resolvePathTravelCamera({
    currentTime: 1.1,
    project: createPathProject(),
    region: {
      ...createPathRegion(),
      easing: VideoTemporalEasing.INSTANT,
    },
  });

  expect(camera.scale).toBe(2);
  expect(camera.viewportX).toBe(500);
  expect(camera.viewportY).toBe(300);
});

it('falls back to a default linear segment when segment metadata is missing', () => {
  const camera = resolvePathTravelCamera({
    currentTime: 3,
    project: createPathProject(),
    region: {
      ...createPathRegion(),
      path: {
        segments: [],
        stops: createPathRegion().path?.stops ?? [],
      },
    },
  });

  expect(camera.focusPoint).toEqual({ x: 850, y: 525 });
  expect(camera.scale).toBe(2.25);
});

it('treats duplicate stop offsets as a completed segment during travel', () => {
  const region = createPathRegion();
  const [firstStop, lastStop] = region.path?.stops ?? [];
  const camera = resolvePathTravelCamera({
    currentTime: 2.5,
    project: createPathProject(),
    region: {
      ...region,
      path: {
        segments: region.path?.segments ?? [],
        stops: firstStop && lastStop ? [firstStop, { ...lastStop, offset: firstStop.offset }] : [],
      },
    },
  });

  expect(camera.focusPoint).toEqual({ x: 900, y: 550 });
  expect(camera.scale).toBe(2.5);
});
