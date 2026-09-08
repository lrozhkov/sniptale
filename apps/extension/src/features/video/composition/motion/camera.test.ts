import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../project/factories/creation';
import {
  VideoMotionFocusMode,
  VideoMotionOverlayZoomMode,
  VideoTemporalEasing,
} from '../../project/types/index';
import { resolveVideoCompositionCamera, mapCompositionPointThroughCamera } from './index';
import { createVideoProjectMotionRegion } from '../../project/motion';
import { createProject, createVideoClip } from '../../project/timeline/project-meta.test.helpers';

it('lands on the action geometry at the destination time during a media transition', () => {
  const firstClip = createVideoClip({
    id: 'a',
    duration: 4,
    sourceDuration: 4,
    sourceInstanceId: 'source',
  });
  const secondClip = { ...firstClip, id: 'b', startTime: 2 };
  const project = createProject([firstClip, secondClip]);
  project.transitions = [
    {
      id: 'slide',
      leadingClipId: 'a',
      trailingClipId: 'b',
      duration: 2,
      kind: 'SLIDE',
      easing: 'LINEAR',
      renderKind: 'CSS_LIKE',
      templateKind: 'SLIDE',
      direction: 'LEFT',
    },
  ];
  project.actionEvents = [
    {
      id: 'click',
      kind: 'CLICK',
      label: 'Click',
      data: {},
      point: { x: 0.75, y: 0.5 },
      anchor: {
        kind: 'recording-source',
        recordingId: 'rec-asset-video',
        sourceInstanceId: 'source',
        sourceEventId: 'raw',
        sourceTime: 0.5,
      },
    },
  ];
  const first = {
    ...createVideoProjectMotionRegion(project, 0),
    duration: 1,
    scale: 2,
    focusPoint: { x: 200, y: 300 },
  };
  const second = {
    ...createVideoProjectMotionRegion(project, 3),
    duration: 1,
    scale: 2,
    focusMode: VideoMotionFocusMode.ACTION,
    targetAction: { eventId: 'click', clipId: 'b' },
    incomingConnection: { fromRegionId: first.id, easing: VideoTemporalEasing.LINEAR },
  };
  project.motionRegions = [first, second];
  const at = (currentTime: number) =>
    resolveVideoCompositionCamera({ project, currentTime, actions: [], cursorSample: null });
  const incoming = at(3).focusPoint;
  expect(incoming.x).not.toBe(960);
  expect(at(2).focusPoint.x).toBeCloseTo((200 + incoming.x) / 2);
  expect(at(2.999999).focusPoint.x).toBeCloseTo(incoming.x, 2);
  expect(at(3.1).focusPoint.x).not.toBe(incoming.x);
});

it('keeps a centred frame stationary throughout zoom-in and zoom-out animations', () => {
  const project = createEmptyVideoProject('Centred framing', 800, 600);
  for (const scale of [0.1, 0.5, 2, 4]) {
    project.motionRegions = [{ ...createVideoProjectMotionRegion(project, 0), duration: 3, scale }];
    for (const currentTime of [0, 0.05, 0.15, 0.3, 1.5, 2.7, 2.85, 2.99]) {
      const camera = resolveVideoCompositionCamera({
        project,
        currentTime,
        actions: [],
        cursorSample: null,
      });
      const centre = mapCompositionPointThroughCamera({ x: 400, y: 300 }, camera);
      expect(centre.x).toBeCloseTo(400, 8);
      expect(centre.y).toBeCloseTo(300, 8);
    }
  }
});

it('keeps the centre fixed when a connection crosses original scale', () => {
  const project = createEmptyVideoProject('Crossing original scale', 800, 600);
  const first = {
    ...createVideoProjectMotionRegion(project, 0),
    id: 'wide',
    duration: 1,
    scale: 0.5,
  };
  const second = {
    ...createVideoProjectMotionRegion(project, 2),
    id: 'close',
    duration: 1,
    scale: 1.5,
    incomingConnection: { fromRegionId: first.id, easing: VideoTemporalEasing.LINEAR },
  };
  project.motionRegions = [first, second];
  for (const currentTime of [1, 1.25, 1.5, 1.75, 2]) {
    const camera = resolveVideoCompositionCamera({
      project,
      currentTime,
      actions: [],
      cursorSample: null,
    });
    expect(camera.scale).toBeCloseTo(currentTime - 0.5);
    const centre = mapCompositionPointThroughCamera({ x: 400, y: 300 }, camera);
    expect(centre.x).toBeCloseTo(400);
    expect(centre.y).toBeCloseTo(300);
  }
});

it('connects two held framing states without zooming out between them', () => {
  const project = createEmptyVideoProject('Connected framing', 800, 600);
  const first = {
    ...createVideoProjectMotionRegion(project, 0),
    id: 'first',
    duration: 2,
    scale: 2,
    focusPoint: { x: 200, y: 300 },
  };
  const second = {
    ...createVideoProjectMotionRegion(project, 4),
    id: 'second',
    duration: 2,
    scale: 2,
    focusPoint: { x: 600, y: 300 },
    incomingConnection: { fromRegionId: first.id, easing: VideoTemporalEasing.LINEAR },
  };
  project.motionRegions = [first, second];
  const at = (currentTime: number) =>
    resolveVideoCompositionCamera({
      project,
      currentTime,
      actions: [],
      cursorSample: null,
    });
  expect(at(0).scale).toBe(1);
  for (const time of [1.99, 2, 3, 4, 4.01]) expect(at(time).scale).toBe(2);
  expect(at(2).viewportX).toBe(0);
  expect(at(3).viewportX).toBe(200);
  expect(at(4).viewportX).toBe(400);
  expect(at(6).scale).toBe(1);
  second.startTime = 5;
  expect(at(3.5).viewportX).toBe(200);
  project.motionRegions = [second];
  expect(at(3).scale).toBe(1);
});

it.each([
  [VideoMotionFocusMode.MANUAL, VideoMotionFocusMode.ACTION],
  [VideoMotionFocusMode.ACTION, VideoMotionFocusMode.MANUAL],
  [VideoMotionFocusMode.ACTION, VideoMotionFocusMode.ACTION],
])(
  'connects %s to %s using action focus without returning to the full frame',
  (fromMode, toMode) => {
    const project = createEmptyVideoProject('Action connections', 800, 600);
    project.duration = 6;
    project.actionEvents = [
      {
        id: 'left',
        kind: 'CLICK',
        label: 'Left',
        data: {},
        point: { x: 200, y: 300 },
        anchor: { kind: 'project', time: 0.5 },
      },
      {
        id: 'right',
        kind: 'CLICK',
        label: 'Right',
        data: {},
        point: { x: 600, y: 300 },
        anchor: { kind: 'project', time: 4.5 },
      },
    ];
    const first = {
      ...createVideoProjectMotionRegion(project, 0),
      duration: 2,
      scale: 2,
      focusMode: fromMode,
      focusPoint: { x: 200, y: 300 },
      targetAction: { eventId: 'left', clipId: null },
    };
    const second = {
      ...createVideoProjectMotionRegion(project, 4),
      duration: 2,
      scale: 2,
      focusMode: toMode,
      focusPoint: { x: 600, y: 300 },
      targetAction: { eventId: 'right', clipId: null },
      incomingConnection: { fromRegionId: first.id, easing: VideoTemporalEasing.LINEAR },
    };
    project.motionRegions = [first, second];
    const at = (currentTime: number) =>
      resolveVideoCompositionCamera({ project, currentTime, actions: [], cursorSample: null });
    for (const time of [1.99, 2, 3, 4, 4.01]) expect(at(time).scale).toBe(2);
    expect(at(2).focusPoint.x).toBe(200);
    expect(at(3).focusPoint.x).toBe(400);
    expect(at(4).focusPoint.x).toBe(600);
    if (toMode === VideoMotionFocusMode.ACTION) {
      project.actionEvents[1]!.presentation = { point: { x: 500, y: 250 } };
      expect(at(3).focusPoint).toEqual({ x: 350, y: 275 });
      expect(at(4).focusPoint).toEqual({ x: 500, y: 250 });
      project.actionEvents = [project.actionEvents[0]!];
      expect(at(3).focusPoint).toEqual({ x: 400, y: 300 });
    }
  }
);

it('does not connect overlapping or nonadjacent framing states', () => {
  const project = createEmptyVideoProject('Invalid connection', 800, 600);
  const first = {
    ...createVideoProjectMotionRegion(project, 0),
    id: 'first',
    duration: 2,
    scale: 2,
  };
  const second = {
    ...createVideoProjectMotionRegion(project, 4),
    id: 'second',
    duration: 2,
    scale: 2,
    incomingConnection: { fromRegionId: first.id, easing: VideoTemporalEasing.LINEAR },
  };
  const middle = { ...createVideoProjectMotionRegion(project, 2.5), duration: 0.5 };
  project.motionRegions = [first, middle, second];
  const at = (currentTime: number) =>
    resolveVideoCompositionCamera({
      project,
      currentTime,
      actions: [],
      cursorSample: null,
    });
  expect(at(3.5).scale).toBe(1);
  project.motionRegions = [first, second];
  second.startTime = 1;
  expect(at(1).scale).toBe(1);
});

function createManualAreaProject() {
  const project = createEmptyVideoProject('Manual area camera', 800, 600);
  project.motionRegions = [
    {
      duration: 2,
      easing: VideoTemporalEasing.LINEAR,
      focusArea: { height: 300, width: 400, x: 200, y: 150 },
      focusMode: VideoMotionFocusMode.MANUAL_AREA,
      focusPoint: null,
      id: 'motion-area',
      motionBlurAmount: 0.2,
      overlayZoomMode: VideoMotionOverlayZoomMode.FOLLOW_CAMERA,

      scale: 1,
      startTime: 0,
      targetAction: null,
      zoomInDuration: 0,
      zoomOutDuration: 0,
    },
  ];
  return project;
}

it('resolves manual-area camera focus and honors hidden camera lanes', () => {
  const project = createManualAreaProject();

  expect(
    resolveVideoCompositionCamera({
      actions: [],
      cursorSample: null,
      currentTime: 1,
      project,
    })
  ).toEqual(
    expect.objectContaining({
      focusPoint: { x: 400, y: 300 },
      overlayZoomMode: VideoMotionOverlayZoomMode.FOLLOW_CAMERA,
      scale: 2,
      viewportX: 200,
      viewportY: 150,
    })
  );

  project.utilityLanes = {
    actions: { locked: false, visible: true },
    camera: { locked: false, visible: false },
  };
  expect(
    resolveVideoCompositionCamera({
      actions: [],
      cursorSample: null,
      currentTime: 1,
      project,
    }).regionId
  ).toBeNull();
});
