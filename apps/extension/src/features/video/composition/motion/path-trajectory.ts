import {
  VideoMotionPathTrajectoryPreset,
  type VideoProjectMotionPathSegment,
  type VideoProjectMotionPathStop,
} from '../../project/types/index';
import { lerpPoint } from './math';

function resolveSoftArcPoint(
  start: { x: number; y: number },
  end: { x: number; y: number },
  progress: number
) {
  const midpoint = lerpPoint(start, end, 0.5);
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const distance = Math.hypot(deltaX, deltaY);
  const arcOffset = Math.min(120, Math.max(24, distance * 0.18));
  const direction = start.x <= end.x ? -1 : 1;
  const normal =
    distance === 0 ? { x: 0, y: direction } : { x: -deltaY / distance, y: deltaX / distance };
  const control = {
    x: midpoint.x + normal.x * arcOffset * direction,
    y: midpoint.y + normal.y * arcOffset * direction,
  };
  const inverse = 1 - progress;

  return {
    x:
      inverse * inverse * start.x +
      2 * inverse * progress * control.x +
      progress * progress * end.x,
    y:
      inverse * inverse * start.y +
      2 * inverse * progress * control.y +
      progress * progress * end.y,
  };
}

export function interpolatePathFocusPoint(
  start: { x: number; y: number },
  end: { x: number; y: number },
  progress: number,
  segment: Pick<VideoProjectMotionPathSegment, 'trajectoryPreset'>
) {
  return segment.trajectoryPreset === VideoMotionPathTrajectoryPreset.SOFT_ARC
    ? resolveSoftArcPoint(start, end, progress)
    : lerpPoint(start, end, progress);
}

export function resolvePathSegmentIndex(
  stops: readonly VideoProjectMotionPathStop[],
  travelProgress: number
): number {
  for (let index = 0; index < stops.length - 1; index += 1) {
    const nextOffset = stops[index + 1]?.offset ?? 1;
    if (travelProgress <= nextOffset || index === stops.length - 2) {
      return index;
    }
  }

  return Math.max(0, stops.length - 2);
}
