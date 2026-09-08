import { createVideoClipFromAsset } from '../../project/factories/clip';
import { resolveVideoCompositionActions } from '../timeline/frame/actions';
import { expect, it } from 'vitest';
import { createEmptyVideoProject, createVideoProjectAsset } from '../../project/factories/creation';
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
      id: 'action-1',
      kind: VideoProjectActionEventKind.CLICK,
      label: 'Action',
      point: { x: 750, y: 500 },
      presentation: { preset: VideoProjectActionPreset.CLICK_RIPPLE },
      anchor: { kind: 'project', time: 2.1 },
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
      targetAction: null,
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
      targetAction: { eventId: 'action-1', clipId: null },
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
    actions: [],
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
    targetAction: null,
    zoomInDuration: 0.2,
    zoomOutDuration: 0.5,
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

it('uses the authored fallback rather than an arbitrary active event while easing out', () => {
  const project = createEmptyVideoProject('Camera', 800, 600);
  project.motionRegions = [createActionFocusMotionRegion()];
  project.duration = 4;
  project.actionEvents = [
    {
      id: 'unrelated',
      kind: 'CLICK',
      label: 'Other',
      data: {},
      anchor: { kind: 'project', time: 2.5 },
      point: { x: 700, y: 450 },
    },
  ];

  const camera = resolveVideoCompositionCamera({
    actions: resolveVideoCompositionActions(project, 2.9),
    cursorSample: null,
    currentTime: 2.9,
    project,
  });

  expect(camera).toEqual(
    expect.objectContaining({
      focusPoint: { x: 100, y: 150 },
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
      targetAction: null,
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
      targetAction: null,
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

it('keeps an explicit framing target while history visualization is hidden and uses its point override', () => {
  const project = createCameraProject();
  project.utilityLanes = {
    actions: { visible: false, locked: false },
    camera: { visible: true, locked: false },
  };
  project.actionEvents[0]!.presentation = { enabled: false, point: { x: 400, y: 300 } };
  const result = resolveVideoCompositionCamera({
    project,
    currentTime: 5.5,
    actions: [],
    cursorSample: null,
  });
  expect(result.focusPoint).toEqual({ x: 400, y: 300 });
  expect(project.actionEvents[0]!.point).toEqual({ x: 750, y: 500 });
});

it('frames only the named source occurrence, maps its layer geometry and never retargets another repeat', () => {
  const project = createCameraProject();
  const asset = createVideoProjectAsset(
    'Source',
    'VIDEO',
    { kind: 'recording', recordingId: 'recording' },
    {
      width: 400,
      height: 200,
      duration: 8,
      mimeType: 'video/mp4',
      size: 10,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  const clip = createVideoClipFromAsset(
    project.tracks[0]!.id,
    asset,
    project.width,
    project.height,
    0
  );
  if (clip.type !== 'VIDEO') throw new Error('Expected source video');
  clip.sourceInstanceId = 'instance';
  const first = {
    ...clip,
    id: 'first',
    transform: { x: 100, y: 100, width: 200, height: 100, rotation: 0, opacity: 1 },
  };
  const second = { ...clip, id: 'repeat', transform: { ...first.transform, x: 500, y: 300 } };
  project.assets = [asset];
  project.clips = [first, second];
  project.duration = 8;
  project.actionEvents = [
    {
      id: 'captured',
      kind: 'CLICK',
      label: 'Captured',
      data: {},
      point: { x: 0.25, y: 0.75 },
      anchor: {
        kind: 'recording-source',
        recordingId: 'recording',
        sourceInstanceId: 'instance',
        sourceEventId: 'raw',
        sourceTime: 2,
      },
      presentation: { enabled: false },
    },
  ];
  project.motionRegions![1]!.targetAction = { eventId: 'captured', clipId: second.id };
  const resolve = () =>
    resolveVideoCompositionCamera({ project, actions: [], cursorSample: null, currentTime: 5.5 });
  expect(resolve().focusPoint).toEqual({ x: 550, y: 375 });
  project.clips = [first];
  expect(resolve().focusPoint).toEqual({ x: 10, y: 20 });
  project.motionRegions![1]!.targetAction = { eventId: 'captured', clipId: first.id };
  expect(resolve().focusPoint).toEqual({ x: 150, y: 175 });
  project.tracks[0]!.role = 'CAMERA';
  expect(resolve().focusPoint).toEqual({ x: 10, y: 20 });
});
