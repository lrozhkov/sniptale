import { motionTransitionTypeForEasing } from '../../project/motion/timing';
import { cameraTransitionProgress } from '../../project/motion/transitions';
import type { VideoProjectMotionRegion } from '../../project/types';
import { VideoTemporalEasing } from '../../project/types/index';

export function clampProgress(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function applyTemporalEasing(progress: number, easing: VideoTemporalEasing): number {
  const clampedProgress = clampProgress(progress);
  switch (easing) {
    case VideoTemporalEasing.LINEAR:
      return clampedProgress;
    case VideoTemporalEasing.EASE_OUT:
      return 1 - (1 - clampedProgress) * (1 - clampedProgress);
    case VideoTemporalEasing.EASE_IN_OUT:
      return clampedProgress < 0.5
        ? 4 * clampedProgress * clampedProgress * clampedProgress
        : 1 - Math.pow(-2 * clampedProgress + 2, 3) / 2;
    case VideoTemporalEasing.INSTANT:
      return clampedProgress <= 0 ? 0 : 1;
  }
}

export function lerpNumber(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

export function lerpPoint(
  start: { x: number; y: number },
  end: { x: number; y: number },
  progress: number
) {
  return {
    x: lerpNumber(start.x, end.x, progress),
    y: lerpNumber(start.y, end.y, progress),
  };
}

/** Window links use the shared camera curve; old scene links retain their scalar easing. */
export function motionConnectionProgress(region: VideoProjectMotionRegion, progress: number) {
  const easing = region.incomingConnection?.easing ?? VideoTemporalEasing.EASE_IN_OUT;
  if (region.sourceBinding?.coordinateSpace !== 'source-window')
    return applyTemporalEasing(progress, easing);
  return cameraTransitionProgress(progress, motionTransitionTypeForEasing(easing));
}

/** Enumerates an axis-aligned rectangle in clockwise order from its upper-left corner. */
export function rectCorners(rect: { x: number; y: number; width: number; height: number }) {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
}
