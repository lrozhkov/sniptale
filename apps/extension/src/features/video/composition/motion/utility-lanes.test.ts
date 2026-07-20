import { expect, it } from 'vitest';
import { applyVideoProjectMutationPatch } from '../../project/mutation';
import { createEmptyVideoProject } from '../../project/factories/creation';
import {
  VideoMotionFocusMode,
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

it('falls back to the full viewport when the camera lane is hidden', () => {
  const project = applyVideoProjectMutationPatch(createCameraProject(), {
    utilityLanes: {
      actions: { visible: true, locked: false },
      camera: { visible: false, locked: false },
    },
  });

  expect(
    resolveVideoCompositionCamera({
      actions: [],
      cursorSample: null,
      currentTime: 2,
      project,
    })
  ).toEqual(
    expect.objectContaining({
      focusPoint: { x: 500, y: 400 },
      regionId: null,
      scale: 1,
    })
  );
});

it('ignores project action events for action-focused camera regions when actions are hidden', () => {
  const project = applyVideoProjectMutationPatch(createCameraProject(), {
    utilityLanes: {
      actions: { visible: false, locked: false },
      camera: { visible: true, locked: false },
    },
  });

  expect(
    resolveVideoCompositionCamera({
      actions: [],
      cursorSample: null,
      currentTime: 5.5,
      project,
    })
  ).toEqual(
    expect.objectContaining({
      focusPoint: { x: 10, y: 20 },
      regionId: 'motion-action',
    })
  );
});

it('covers camera easing and viewport mapping helpers', () => {
  expect(applyTemporalEasing(-1, VideoTemporalEasing.LINEAR)).toBe(0);
  expect(applyTemporalEasing(0.5, VideoTemporalEasing.LINEAR)).toBe(0.5);
  expect(applyTemporalEasing(0.5, VideoTemporalEasing.EASE_OUT)).toBe(0.75);
  expect(applyTemporalEasing(0.25, VideoTemporalEasing.EASE_IN_OUT)).toBe(0.0625);
  expect(applyTemporalEasing(0, VideoTemporalEasing.INSTANT)).toBe(0);
  expect(applyTemporalEasing(0.1, VideoTemporalEasing.INSTANT)).toBe(1);
  const camera = {
    focusPoint: { x: 500, y: 400 },
    motionBlurAmount: 0,
    overlayZoomMode: 'LOCK_OVERLAYS',
    regionId: 'motion-1',
    scale: 2,
    viewportHeight: 400,
    viewportWidth: 500,
    viewportX: 100,
    viewportY: 50,
  } as const;

  expect(mapCompositionPointThroughCamera({ x: 150, y: 100 }, camera)).toEqual({ x: 100, y: 100 });
  expect(mapViewportPointToComposition({ x: 100, y: 100 }, camera)).toEqual({ x: 150, y: 100 });
  expect(
    mapCompositionRectThroughCamera({ height: 40, width: 60, x: 150, y: 100 }, camera)
  ).toEqual({
    height: 80,
    width: 120,
    x: 100,
    y: 100,
  });
});

it('resolves cursor-focused camera regions while easing out near the region end', () => {
  const project = createEmptyVideoProject('Camera cursor', 1000, 800);
  project.motionRegions = [
    {
      duration: 2,
      easing: VideoTemporalEasing.EASE_OUT,
      focusMode: VideoMotionFocusMode.CURSOR,
      focusPoint: null,
      id: 'motion-cursor',
      scale: 2,
      startTime: 1,
      targetActionEventId: null,
      zoomInDuration: 0.2,
      zoomOutDuration: 0.5,
    },
  ];

  const camera = resolveVideoCompositionCamera({
    actions: [],
    cursorSample: { id: 'cursor-1', time: 2, visible: true, x: 120, y: 180 },
    currentTime: 2.8,
    project,
  });

  expect(camera).toEqual(
    expect.objectContaining({
      focusPoint: expect.objectContaining({ x: 120, y: 180 }),
      regionId: 'motion-cursor',
    })
  );
  expect(camera.scale).toBeLessThan(2);
});

it('resolves manual-area camera regions with target-scale clamping', () => {
  const project = createEmptyVideoProject('Camera area', 1000, 800);
  project.motionRegions = [
    {
      duration: 2,
      easing: VideoTemporalEasing.LINEAR,
      focusArea: { height: 100, width: 100, x: 300, y: 200 },
      focusMode: VideoMotionFocusMode.MANUAL_AREA,
      focusPoint: null,
      id: 'motion-area',
      scale: 1.5,
      startTime: 1,
      targetActionEventId: null,
      zoomInDuration: 0,
      zoomOutDuration: 0,
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
      focusPoint: { x: 350, y: 250 },
      regionId: 'motion-area',
      scale: 4,
    })
  );
});

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
      scale: 1.5,
      startTime: 5,
      targetActionEventId: 'action-1',
      zoomInDuration: 0.2,
      zoomOutDuration: 0.2,
    },
  ];
  return project;
}
