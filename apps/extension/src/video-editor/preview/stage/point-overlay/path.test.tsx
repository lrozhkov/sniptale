// @vitest-environment jsdom

import type React from 'react';
import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import {
  VideoMotionCameraMode,
  VideoMotionFocusMode,
  VideoMotionPathTargetKind,
} from '../../../../features/video/project/types';
import { createMotionPathStopPointPlacementMode } from '../../../project/selection/placement';
import { handleStagePointPlacement } from './index';

function createCamera() {
  return {
    focusPoint: { x: 100, y: 50 },
    motionBlurAmount: 0,
    regionId: null,
    scale: 1,
    viewportHeight: 100,
    viewportWidth: 200,
    viewportX: 0,
    viewportY: 0,
  } as const;
}

function createStage(width = 200, height = 100) {
  const stage = document.createElement('div');
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  });
  return stage;
}

function createPointEvent(clientX: number, clientY: number) {
  return {
    clientX,
    clientY,
    currentTarget: document.createElement('div'),
    target: document.createElement('div'),
  } as unknown as React.PointerEvent<HTMLDivElement>;
}

it('places the selected moving-zoom path stop on stage click and preserves path mode', () => {
  const project = createMotionPathPointProject();
  const onClearPlacementMode = vi.fn();
  const onUpdateMotionRegion = vi.fn();
  const stage = createStage(220, 140);

  const handled = handleStagePointPlacement(createPointEvent(66, 48), {
    camera: createCamera(),
    onClearPlacementMode,
    onUpdateActionEventDetails: vi.fn(),
    onUpdateMotionRegion,
    placementMode: createMotionPathStopPointPlacementMode('motion-path-1', 'stop-1'),
    project,
    selectedActionEvent: null,
    selectedMotionRegion: project.motionRegions?.[0] ?? null,
    stageRef: { current: stage },
  });

  expect(handled).toBe(true);
  expect(onUpdateMotionRegion).toHaveBeenCalledWith(
    'motion-path-1',
    expect.objectContaining({
      cameraMode: VideoMotionCameraMode.PATH,
      path: expect.objectContaining({
        stops: expect.arrayContaining([
          expect.objectContaining({
            id: 'stop-1',
            target: expect.objectContaining({
              kind: VideoMotionPathTargetKind.POINT,
              x: expect.closeTo(60, 8),
              y: expect.closeTo(30, 8),
            }),
          }),
        ]),
      }),
    })
  );
  expect(onClearPlacementMode).toHaveBeenCalledTimes(1);
});

function createMotionPathPointProject() {
  const project = createEmptyVideoProject('Overlay path point', 200, 100);
  project.motionRegions = [createMotionPathPointRegion()] as never;
  return project;
}

function createMotionPathPointRegion() {
  return {
    cameraMode: VideoMotionCameraMode.PATH,
    duration: 2,
    easing: 'LINEAR',
    focusMode: VideoMotionFocusMode.MANUAL,
    focusPoint: { x: 80, y: 40 },
    id: 'motion-path-1',
    motionBlurAmount: 0,
    path: {
      segments: [{ durationWeight: 1, easing: 'EASE_IN_OUT', trajectoryPreset: 'LINEAR' }],
      stops: [
        {
          id: 'stop-1',
          offset: 0,
          target: { kind: VideoMotionPathTargetKind.POINT, scale: 1.6, x: 60, y: 40 },
        },
        {
          id: 'stop-2',
          offset: 1,
          target: { kind: VideoMotionPathTargetKind.POINT, scale: 1.8, x: 120, y: 60 },
        },
      ],
    },
    scale: 1.4,
    startTime: 0,
    targetActionEventId: null,
    zoomInDuration: 0.2,
    zoomOutDuration: 0.2,
  } as const;
}
