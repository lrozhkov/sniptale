import { expect, it } from 'vitest';

import { createEmptyVideoProject } from '../../project/factories/creation';
import {
  VideoMotionFocusMode,
  VideoMotionOverlayZoomMode,
  VideoTemporalEasing,
} from '../../project/types/index';
import { resolveVideoCompositionCamera } from './index';

it('animates camera pan toward the final viewport path instead of axis-stepping per shrink frame', () => {
  const project = createEmptyVideoProject('Camera path', 1000, 800);
  project.motionRegions = [
    {
      duration: 2,
      easing: VideoTemporalEasing.LINEAR,
      focusMode: VideoMotionFocusMode.MANUAL,
      focusPoint: { x: 900, y: 700 },
      id: 'motion-cinematic',
      motionBlurAmount: 0,
      overlayZoomMode: VideoMotionOverlayZoomMode.FOLLOW_CAMERA,
      scale: 2,
      startTime: 1,
      targetAction: null,
      zoomInDuration: 1,
      zoomOutDuration: 1,
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
      overlayZoomMode: VideoMotionOverlayZoomMode.FOLLOW_CAMERA,
      scale: 1.5,
      viewportHeight: expect.closeTo(533.3333333333, 8),
      viewportWidth: expect.closeTo(666.6666666667, 8),
      viewportX: expect.closeTo(333.3333333333, 8),
      viewportY: expect.closeTo(266.6666666667, 8),
    })
  );
});

it('derives camera zoom from a manual focus area instead of point scale', () => {
  const project = createEmptyVideoProject('Manual area', 1200, 800);
  project.motionRegions = [
    {
      duration: 3,
      easing: VideoTemporalEasing.LINEAR,
      focusArea: { x: 300, y: 200, width: 240, height: 160 },
      focusMode: VideoMotionFocusMode.MANUAL_AREA,
      focusPoint: { x: 420, y: 280 },
      id: 'motion-area',
      motionBlurAmount: 0,
      scale: 1.2,
      startTime: 0,
      targetAction: null,
      zoomInDuration: 0,
      zoomOutDuration: 0,
    },
  ];

  expect(
    resolveVideoCompositionCamera({
      actions: [],
      cursorSample: null,
      currentTime: 0.5,
      project,
    })
  ).toEqual(
    expect.objectContaining({
      focusPoint: { x: 420, y: 280 },
      regionId: 'motion-area',
      scale: 4,
      viewportHeight: 200,
      viewportWidth: 300,
    })
  );
});
