// @vitest-environment jsdom

import { act } from 'react';
import type React from 'react';
import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import {
  VideoMotionCameraMode,
  VideoMotionFocusMode,
  VideoMotionPathTargetKind,
} from '../../../../features/video/project/types';
import { createMotionPathStopAreaPlacementMode } from '../../../project/selection/placement';
import { handleStageAreaPlacement } from './index';

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

function createPointerEvent(clientX: number, clientY: number) {
  return {
    clientX,
    clientY,
    currentTarget: document.createElement('div'),
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    target: document.createElement('div'),
  } as unknown as React.PointerEvent<HTMLDivElement>;
}

it('creates a moving-zoom stop area from stage drag placement', () => {
  const project = createMotionPathAreaProject();
  const onClearPlacementMode = vi.fn();
  const onUpdateMotionRegion = vi.fn();
  const stage = createStage(220, 140);

  const handled = handleStageAreaPlacement(createPointerEvent(22, 26), {
    camera: createCamera(),
    onClearPlacementMode,
    onUpdateMotionRegion,
    placementMode: createMotionPathStopAreaPlacementMode('motion-path-1', 'stop-1'),
    project,
    selectedMotionRegion: project.motionRegions?.[0] ?? null,
    stageRef: { current: stage },
  });

  const moveEvent = new Event('pointermove');
  Object.defineProperty(moveEvent, 'clientX', { value: 132 });
  Object.defineProperty(moveEvent, 'clientY', { value: 81 });

  act(() => {
    window.dispatchEvent(moveEvent);
    window.dispatchEvent(new Event('pointerup'));
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
              kind: VideoMotionPathTargetKind.AREA,
              height: expect.closeTo(50, 8),
              width: expect.closeTo(100, 8),
              x: expect.closeTo(20, 8),
              y: expect.closeTo(10, 8),
            }),
          }),
        ]),
      }),
    })
  );
  expect(onClearPlacementMode).toHaveBeenCalledTimes(1);
});

function createMotionPathAreaProject() {
  const project = createEmptyVideoProject('Area path', 200, 100);
  project.motionRegions = [createMotionPathAreaRegion()] as never;
  return project;
}

function createMotionPathAreaRegion() {
  return {
    cameraMode: VideoMotionCameraMode.PATH,
    duration: 2,
    easing: 'LINEAR',
    focusMode: VideoMotionFocusMode.MANUAL_AREA,
    focusArea: { x: 20, y: 10, width: 80, height: 60 },
    focusPoint: { x: 60, y: 40 },
    id: 'motion-path-1',
    motionBlurAmount: 0,
    path: {
      segments: [{ durationWeight: 1, easing: 'EASE_IN_OUT', trajectoryPreset: 'LINEAR' }],
      stops: [
        {
          id: 'stop-1',
          offset: 0,
          target: { height: 60, kind: VideoMotionPathTargetKind.AREA, width: 80, x: 20, y: 10 },
        },
        {
          id: 'stop-2',
          offset: 1,
          target: { height: 50, kind: VideoMotionPathTargetKind.AREA, width: 70, x: 90, y: 20 },
        },
      ],
    },
    scale: 1.5,
    startTime: 0,
    targetActionEventId: null,
    zoomInDuration: 0.2,
    zoomOutDuration: 0.2,
  } as const;
}
