import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../project/factories/creation';
import {
  VideoMotionFocusMode,
  VideoMotionOverlayZoomMode,
  VideoTemporalEasing,
} from '../../project/types/index';
import { resolveVideoCompositionCamera } from './index';

function createMotionRegion(index: number) {
  return {
    duration: 2,
    easing: VideoTemporalEasing.EASE_OUT,
    focusMode: VideoMotionFocusMode.MANUAL,
    focusPoint: { x: 100 + index, y: 150 + index },
    id: `motion-${index}`,
    motionBlurAmount: 0,
    overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
    scale: 2,
    startTime: index * 0.1,
    targetActionEventId: null,
    zoomInDuration: 0.2,
    zoomOutDuration: 0.5,
  };
}

it('resolves the latest active region from a large unsorted list without sorting per frame', () => {
  const project = createEmptyVideoProject('Camera', 900, 700);
  project.motionRegions = [
    ...Array.from({ length: 300 }, (_, index) => createMotionRegion(index)).toReversed(),
    {
      ...createMotionRegion(540),
      focusPoint: { x: 640, y: 360 },
      id: 'latest-active',
      startTime: 12.01,
    },
  ];
  const sortSpy = vi.spyOn(Array.prototype, 'sort');

  const camera = resolveVideoCompositionCamera({
    actions: [],
    cursorSample: null,
    currentTime: 12.02,
    project,
  });

  try {
    expect(sortSpy).not.toHaveBeenCalled();
  } finally {
    sortSpy.mockRestore();
  }
  expect(camera).toEqual(
    expect.objectContaining({
      focusPoint: { x: 640, y: 360 },
      regionId: 'latest-active',
    })
  );
});
