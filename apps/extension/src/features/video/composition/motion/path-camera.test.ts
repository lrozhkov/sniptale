import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../project/factories/creation';
import {
  VideoMotionOverlayZoomMode,
  VideoMotionPathTrajectoryPreset,
  VideoTemporalEasing,
} from '../../project/types/index';
import {
  getDefaultFocusPoint,
  resolveIntroCamera,
  resolveOutroCamera,
  resolvePathStopState,
  resolveTravelCamera,
} from './path-camera';

const project = createEmptyVideoProject('Motion path camera', 1200, 800);

it('resolves the default focus point and stop state for point and area targets', () => {
  expect(getDefaultFocusPoint(project)).toEqual({ x: 600, y: 400 });
  expect(
    resolvePathStopState(project, {
      id: 'point-stop',
      offset: 0,
      target: { kind: 'POINT', scale: 2, x: 900, y: 500 },
    })
  ).toEqual(
    expect.objectContaining({
      viewportHeight: 400,
      viewportWidth: 600,
      viewportX: 600,
      viewportY: 300,
    })
  );
  expect(
    resolvePathStopState(project, {
      id: 'area-stop',
      offset: 0,
      target: { height: 200, kind: 'AREA', width: 300, x: 450, y: 260 },
    })
  ).toEqual(
    expect.objectContaining({
      focusPoint: { x: 600, y: 360 },
      scale: 4,
      viewportX: 450,
      viewportY: 260,
    })
  );
});

it('resolves intro and outro camera frames with non-linear easing variants', () => {
  const stopState = resolvePathStopState(project, {
    id: 'point-stop',
    offset: 0,
    target: { kind: 'POINT', scale: 2, x: 900, y: 500 },
  });

  const intro = resolveIntroCamera(project, stopState, 0.5, {
    easing: VideoTemporalEasing.EASE_OUT,
    motionBlurAmount: 0.2,
    overlayZoomMode: VideoMotionOverlayZoomMode.FOLLOW_CAMERA,
    regionId: 'motion-1',
  });
  const outro = resolveOutroCamera(project, stopState, 0.5, {
    easing: VideoTemporalEasing.INSTANT,
    motionBlurAmount: 0.2,
    overlayZoomMode: VideoMotionOverlayZoomMode.FOLLOW_CAMERA,
    regionId: 'motion-1',
  });

  expect(intro.scale).toBeGreaterThan(1.5);
  expect(intro.viewportX).toBeGreaterThan(300);
  expect(outro.scale).toBe(1);
  expect(outro.viewportX).toBe(0);
});

it('clamps travel progress and falls back to default segment settings when metadata is missing', () => {
  const camera = resolveTravelCamera(
    project,
    [
      { id: 'stop-1', offset: 0, target: { kind: 'POINT', scale: 2, x: 250, y: 250 } },
      { id: 'stop-2', offset: 1, target: { kind: 'POINT', scale: 3, x: 950, y: 550 } },
    ],
    [],
    {
      easing: VideoTemporalEasing.EASE_IN_OUT,
      endTime: 2,
      localTime: 5,
      motionBlurAmount: 0.3,
      overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
      regionId: 'motion-path',
      startTime: 1,
    }
  );

  expect(camera.focusPoint).toEqual({ x: 950, y: 550 });
  expect(camera.scale).toBe(3);
  expect(camera.viewportX).toBe(750);
  expect(camera.viewportY).toBeCloseTo(416.6666666667, 8);
});

it('uses segment easing metadata and resolves same-offset path stops deterministically', () => {
  const camera = resolveTravelCamera(
    project,
    [
      { id: 'stop-1', offset: 0, target: { kind: 'POINT', scale: 1, x: 600, y: 400 } },
      { id: 'stop-2', offset: 0, target: { kind: 'POINT', scale: 2, x: 900, y: 500 } },
    ],
    [
      {
        durationWeight: 1,
        easing: VideoTemporalEasing.LINEAR,
        trajectoryPreset: VideoMotionPathTrajectoryPreset.LINEAR,
      },
    ],
    {
      easing: VideoTemporalEasing.EASE_OUT,
      endTime: 2,
      localTime: 1,
      motionBlurAmount: 0,
      overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
      regionId: 'motion-path',
      startTime: 0,
    }
  );

  expect(camera.focusPoint).toEqual({ x: 900, y: 500 });
  expect(camera.scale).toBe(2);
});
