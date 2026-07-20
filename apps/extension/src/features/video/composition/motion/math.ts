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
