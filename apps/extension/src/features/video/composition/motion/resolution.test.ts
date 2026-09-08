import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../project/factories/creation';
import {
  VideoMotionFocusMode,
  VideoMotionOverlayZoomMode,
  VideoTemporalEasing,
  type VideoProjectMotionRegion,
} from '../../project/types/index';
import { resolveVideoCompositionCamera } from './index';

function createRegion(overrides: Partial<VideoProjectMotionRegion> = {}) {
  return {
    ...createBaseRegion(),
    ...overrides,
  };
}

function createBaseRegion(): VideoProjectMotionRegion {
  return {
    duration: 2,
    easing: VideoTemporalEasing.LINEAR,
    focusMode: VideoMotionFocusMode.MANUAL,
    focusPoint: { x: 200, y: 150 },
    id: 'motion-1',
    motionBlurAmount: 0,
    overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
    scale: 2,
    startTime: 0,
    targetAction: null,
    zoomInDuration: 0,
    zoomOutDuration: 0,
  };
}

it('falls back to the explicit focus point when action focus has no target action', () => {
  const project = createEmptyVideoProject('Camera', 800, 600);
  project.motionRegions = [
    createRegion({
      focusMode: VideoMotionFocusMode.ACTION,
      focusPoint: { x: 320, y: 260 },
    }),
  ];

  expect(
    resolveVideoCompositionCamera({
      actions: [],
      cursorSample: null,
      currentTime: 0.5,
      project,
    })
  ).toEqual(expect.objectContaining({ focusPoint: { x: 320, y: 260 } }));
});

it('falls back to the project center when action focus has no target or fallback point', () => {
  const project = createEmptyVideoProject('Camera', 800, 600);
  project.motionRegions = [
    createRegion({
      focusMode: VideoMotionFocusMode.ACTION,
      focusPoint: null,
    }),
  ];

  expect(
    resolveVideoCompositionCamera({
      actions: [],
      cursorSample: null,
      currentTime: 0.5,
      project,
    })
  ).toEqual(expect.objectContaining({ focusPoint: { x: 400, y: 300 } }));
});

it('falls back to the explicit focus point when manual area focus has no area target', () => {
  const project = createEmptyVideoProject('Camera', 800, 600);
  project.motionRegions = [
    createRegion({
      focusArea: null,
      focusMode: VideoMotionFocusMode.MANUAL_AREA,
      focusPoint: { x: 500, y: 280 },
      scale: 1.6,
    }),
  ];

  expect(
    resolveVideoCompositionCamera({
      actions: [],
      cursorSample: null,
      currentTime: 1,
      project,
    })
  ).toEqual(
    expect.objectContaining({
      focusPoint: { x: 500, y: 280 },
      regionId: 'motion-1',
      scale: 1.6,
    })
  );
});

it('uses the explicit focus point when cursor focus has no sample', () => {
  const project = createEmptyVideoProject('Camera', 800, 600);
  project.motionRegions = [
    createRegion({
      focusMode: VideoMotionFocusMode.CURSOR,
      focusPoint: { x: 260, y: 180 },
    }),
  ];

  expect(
    resolveVideoCompositionCamera({
      actions: [],
      cursorSample: null,
      currentTime: 0.5,
      project,
    })
  ).toEqual(expect.objectContaining({ focusPoint: { x: 260, y: 180 } }));
});

it('applies zoom-in progress during the intro phase of a static motion region', () => {
  const project = createEmptyVideoProject('Camera', 800, 600);
  project.motionRegions = [
    createRegion({
      easing: VideoTemporalEasing.LINEAR,
      focusPoint: { x: 600, y: 400 },
      zoomInDuration: 1,
      zoomOutDuration: 0,
    }),
  ];

  const camera = resolveVideoCompositionCamera({
    actions: [],
    cursorSample: null,
    currentTime: 0.5,
    project,
  });

  expect(camera.focusPoint).toEqual({ x: 600, y: 400 });
  expect(camera.scale).toBe(1.5);
  expect(camera.viewportX * camera.scale).toBeCloseTo(400);
  expect(camera.viewportY * camera.scale).toBeCloseTo(250);
});

it('falls back to the project center for manual focus when no focus point is provided', () => {
  const project = createEmptyVideoProject('Camera', 800, 600);
  project.motionRegions = [
    createRegion({ focusMode: VideoMotionFocusMode.MANUAL, focusPoint: null }),
  ];

  expect(
    resolveVideoCompositionCamera({
      actions: [],
      cursorSample: null,
      currentTime: 0.5,
      project,
    })
  ).toEqual(expect.objectContaining({ focusPoint: { x: 400, y: 300 } }));
});
