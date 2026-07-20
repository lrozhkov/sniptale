import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../project/factories/creation';
import {
  VideoMotionCameraMode,
  VideoMotionFocusMode,
  VideoMotionOverlayZoomMode,
  VideoTemporalEasing,
} from '../../project/types/index';
import { resolveVideoCompositionCamera } from './index';

function createManualAreaProject() {
  const project = createEmptyVideoProject('Manual area camera', 800, 600);
  project.motionRegions = [
    {
      cameraMode: VideoMotionCameraMode.STATIC,
      duration: 2,
      easing: VideoTemporalEasing.LINEAR,
      focusArea: { height: 300, width: 400, x: 200, y: 150 },
      focusMode: VideoMotionFocusMode.MANUAL_AREA,
      focusPoint: null,
      id: 'motion-area',
      motionBlurAmount: 0.2,
      overlayZoomMode: VideoMotionOverlayZoomMode.FOLLOW_CAMERA,
      path: null,
      scale: 1,
      startTime: 0,
      targetActionEventId: null,
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
