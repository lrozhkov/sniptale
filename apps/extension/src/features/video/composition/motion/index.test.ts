import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../project/factories/creation';
import {
  VideoMotionFocusMode,
  VideoMotionOverlayZoomMode,
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  VideoTemporalEasing,
} from '../../project/types/index';
import {
  applyTemporalEasing,
  mapCompositionPointThroughCamera,
  mapCompositionRectThroughCamera,
  mapViewportPointToComposition,
  resolveVideoCompositionCamera,
} from './index';
function createCameraProject() {
  const project = createEmptyVideoProject('Camera', 1000, 800);
  project.actionEvents = [
    {
      data: {},
      duration: 0.6,
      id: 'action-1',
      kind: VideoProjectActionEventKind.CLICK,
      label: 'Action',
      point: { x: 750, y: 500 },
      preset: VideoProjectActionPreset.CLICK_RIPPLE,
      time: 2.1,
    },
  ];
  project.motionRegions = [
    {
      duration: 3,
      easing: VideoTemporalEasing.EASE_IN_OUT,
      focusMode: VideoMotionFocusMode.CURSOR,
      focusPoint: { x: 500, y: 400 },
      id: 'motion-cursor',
      motionBlurAmount: 0,
      overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
      scale: 2,
      startTime: 1,
      targetActionEventId: null,
      zoomInDuration: 0.5,
      zoomOutDuration: 0.5,
    },
    {
      duration: 1,
      easing: VideoTemporalEasing.LINEAR,
      focusMode: VideoMotionFocusMode.ACTION,
      focusPoint: { x: 10, y: 20 },
      id: 'motion-action',
      motionBlurAmount: 0,
      overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
      scale: 1.5,
      startTime: 5,
      targetActionEventId: 'action-1',
      zoomInDuration: 0.2,
      zoomOutDuration: 0.2,
    },
  ];
  return project;
}
function createCursorCameraProjectResult() {
  return resolveVideoCompositionCamera({
    actions: [],
    cursorSample: {
      id: 'cursor-1',
      interpolation: VideoTemporalEasing.LINEAR,
      time: 2,
      visible: true,
      x: 100,
      y: 200,
    },
    currentTime: 2,
    project: createCameraProject(),
  });
}
function createActionCameraProjectResult() {
  const project = createCameraProject();
  return resolveVideoCompositionCamera({
    actions: [
      {
        duration: 0.6,
        event: project.actionEvents[0]!,
        point: { x: 750, y: 500 },
        progress: 0.5,
        start: 2.1,
      },
    ],
    cursorSample: null,
    currentTime: 5.5,
    project,
  });
}

function createActionFocusMotionRegion() {
  return {
    duration: 2,
    easing: VideoTemporalEasing.EASE_OUT,
    focusMode: VideoMotionFocusMode.ACTION,
    focusPoint: { x: 100, y: 150 },
    id: 'motion-1',
    motionBlurAmount: 0,
    overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
    scale: 2,
    startTime: 1,
    targetActionEventId: null,
    zoomInDuration: 0.2,
    zoomOutDuration: 0.5,
  };
}

function createFallbackAction() {
  return {
    duration: 0.7,
    event: {
      data: {},
      duration: 0.7,
      id: 'action-1',
      kind: VideoProjectActionEventKind.CLICK,
      label: 'Action',
      point: { x: 700, y: 450 },
      preset: VideoProjectActionPreset.CLICK_RIPPLE,
      time: 2,
    },
    point: { x: 700, y: 450 },
    progress: 0.5,
    start: 2,
  };
}

it('applies each temporal easing variant deterministically', () => {
  expect(applyTemporalEasing(-1, VideoTemporalEasing.LINEAR)).toBe(0);
  expect(applyTemporalEasing(0.5, VideoTemporalEasing.LINEAR)).toBe(0.5);
  expect(applyTemporalEasing(0.5, VideoTemporalEasing.EASE_OUT)).toBe(0.75);
  expect(applyTemporalEasing(0.5, VideoTemporalEasing.EASE_IN_OUT)).toBe(0.5);
  expect(applyTemporalEasing(0.5, VideoTemporalEasing.INSTANT)).toBe(1);
});
it('resolves camera focus for cursor and action driven motion regions', () => {
  const cursorCamera = createCursorCameraProjectResult();
  const actionCamera = createActionCameraProjectResult();

  expect(cursorCamera).toEqual(
    expect.objectContaining({
      focusPoint: expect.objectContaining({ x: 100, y: 200 }),
      motionBlurAmount: 0,
      overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
      regionId: 'motion-cursor',
      scale: 2,
    })
  );
  expect(actionCamera).toEqual(
    expect.objectContaining({
      focusPoint: { x: 750, y: 500 },
      regionId: 'motion-action',
    })
  );
});
it('falls back to the full project viewport when no motion region is active', () => {
  const project = createEmptyVideoProject('Camera', 640, 360);

  expect(
    resolveVideoCompositionCamera({
      actions: [],
      cursorSample: null,
      currentTime: 2,
      project,
    })
  ).toEqual({
    focusPoint: { x: 320, y: 180 },
    motionBlurAmount: 0,
    overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
    regionId: null,
    scale: 1,
    viewportHeight: 360,
    viewportWidth: 640,
    viewportX: 0,
    viewportY: 0,
  });
});

it('falls back to the first action point and eases zoom back out near region end', () => {
  const project = createEmptyVideoProject('Camera', 800, 600);
  project.motionRegions = [createActionFocusMotionRegion()];

  const camera = resolveVideoCompositionCamera({
    actions: [createFallbackAction()],
    cursorSample: null,
    currentTime: 2.9,
    project,
  });

  expect(camera).toEqual(
    expect.objectContaining({
      focusPoint: { x: 700, y: 450 },
      regionId: 'motion-1',
    })
  );
  expect(camera.scale).toBeLessThan(2);
});

it('prefers the latest overlapping region and falls back to the project center when cursor focus has no sample', () => {
  const project = createEmptyVideoProject('Camera', 900, 700);
  project.motionRegions = [
    {
      duration: 4,
      easing: VideoTemporalEasing.LINEAR,
      focusMode: VideoMotionFocusMode.MANUAL,
      focusPoint: { x: 120, y: 160 },
      id: 'motion-a',
      motionBlurAmount: 0,
      overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
      scale: 1.4,
      startTime: 1,
      targetActionEventId: null,
      zoomInDuration: 0,
      zoomOutDuration: 0,
    },
    {
      duration: 2,
      easing: VideoTemporalEasing.LINEAR,
      focusMode: VideoMotionFocusMode.CURSOR,
      focusPoint: null,
      id: 'motion-b',
      motionBlurAmount: 0,
      overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
      scale: 1.8,
      startTime: 2,
      targetActionEventId: null,
      zoomInDuration: 0,
      zoomOutDuration: 0,
    },
  ];

  expect(
    resolveVideoCompositionCamera({
      actions: [],
      cursorSample: null,
      currentTime: 2.5,
      project,
    })
  ).toEqual(
    expect.objectContaining({
      focusPoint: { x: 450, y: 350 },
      motionBlurAmount: 0,
      overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
      regionId: 'motion-b',
      scale: 1.8,
    })
  );
});

it('maps points and rectangles through the active camera viewport', () => {
  const camera = {
    focusPoint: { x: 500, y: 400 },
    motionBlurAmount: 0.35,
    overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
    regionId: 'motion-1',
    scale: 2,
    viewportHeight: 400,
    viewportWidth: 500,
    viewportX: 100,
    viewportY: 50,
  };

  expect(mapCompositionPointThroughCamera({ x: 150, y: 100 }, camera)).toEqual({ x: 100, y: 100 });
  expect(mapCompositionPointThroughCamera({ x: 100, y: 50 }, camera)).toEqual({ x: 0, y: 0 });
  expect(
    mapCompositionRectThroughCamera({ height: 40, width: 60, x: 150, y: 100 }, camera)
  ).toEqual({
    height: 80,
    width: 120,
    x: 100,
    y: 100,
  });
  expect(mapViewportPointToComposition({ x: 100, y: 100 }, camera)).toEqual({ x: 150, y: 100 });
  expect(mapViewportPointToComposition({ x: 0, y: 0 }, camera)).toEqual({ x: 100, y: 50 });
});
