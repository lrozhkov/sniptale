import {
  VideoMotionPathTargetKind,
  type VideoProject,
  type VideoProjectMotionArea,
  type VideoProjectMotionPathAreaTarget,
  type VideoProjectMotionPathPointTarget,
  type VideoProjectMotionPathStop,
} from '../types/index';
import {
  clampFocusAreaOrigin,
  clampFocusAreaSize,
  clampNumber,
  normalizeMotionFocusArea,
  normalizeMotionPoint,
} from './focus-area';

export function createMotionPathPointTarget(
  project: Pick<VideoProject, 'height' | 'width'>,
  point: { x: number; y: number },
  scale: number
): VideoProjectMotionPathPointTarget {
  return {
    kind: VideoMotionPathTargetKind.POINT,
    scale: clampNumber(Number.isFinite(scale) ? scale : 1, 1, 4),
    ...normalizeMotionPoint(project, point.x, point.y),
  };
}

export function createMotionPathAreaTarget(
  project: Pick<VideoProject, 'height' | 'width'>,
  area: VideoProjectMotionArea
): VideoProjectMotionPathAreaTarget {
  const normalizedArea = normalizeMotionFocusArea(project, area) ?? {
    height: project.height,
    width: project.width,
    x: 0,
    y: 0,
  };

  return {
    kind: VideoMotionPathTargetKind.AREA,
    ...normalizedArea,
  };
}

export function resolveMotionPathStopFocusArea(
  project: Pick<VideoProject, 'height' | 'width'>,
  stop: VideoProjectMotionPathStop
): VideoProjectMotionArea {
  if (stop.target.kind === VideoMotionPathTargetKind.AREA) {
    return createMotionPathAreaTarget(project, stop.target);
  }

  const width = clampFocusAreaSize(project.width, project.width / stop.target.scale);
  const height = clampFocusAreaSize(project.height, project.height / stop.target.scale);
  return {
    height,
    width,
    x: clampFocusAreaOrigin(stop.target.x - width / 2, width, project.width),
    y: clampFocusAreaOrigin(stop.target.y - height / 2, height, project.height),
  };
}

export function resolveMotionPathStopFocusPoint(
  project: Pick<VideoProject, 'height' | 'width'>,
  stop: VideoProjectMotionPathStop
) {
  if (stop.target.kind === VideoMotionPathTargetKind.POINT) {
    return normalizeMotionPoint(project, stop.target.x, stop.target.y);
  }

  return {
    x: stop.target.x + stop.target.width / 2,
    y: stop.target.y + stop.target.height / 2,
  };
}

export function resolveMotionPathStopScale(
  project: Pick<VideoProject, 'height' | 'width'>,
  stop: VideoProjectMotionPathStop
): number {
  if (stop.target.kind === VideoMotionPathTargetKind.POINT) {
    return clampNumber(stop.target.scale, 1, 4);
  }

  return Math.min(
    4,
    Math.max(
      1,
      Math.min(
        project.width / Math.max(1, stop.target.width),
        project.height / Math.max(1, stop.target.height)
      )
    )
  );
}
