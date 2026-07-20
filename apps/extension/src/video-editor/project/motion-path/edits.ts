import {
  createMotionPathAreaTarget,
  createMotionPathPointTarget,
} from '../../../features/video/project/motion/path-targets';
import type {
  VideoProject,
  VideoProjectMotionPath,
  VideoProjectMotionPathSegment,
  VideoProjectMotionPathStop,
} from '../../../features/video/project/types/index';
import {
  VideoMotionPathTrajectoryPreset,
  VideoTemporalEasing,
} from '../../../features/video/project/types/index';

export function insertMotionPathStop(
  path: VideoProjectMotionPath,
  stop: VideoProjectMotionPathStop,
  insertIndex: number
): VideoProjectMotionPath {
  const stops = [...path.stops];
  stops.splice(insertIndex, 0, stop);

  return {
    ...path,
    segments: [...path.segments, createDefaultMotionPathSegment()],
    stops,
  };
}

export function createDuplicatedMotionPathStop(
  project: Pick<VideoProject, 'height' | 'width'>,
  stop: VideoProjectMotionPathStop,
  offset: number
): VideoProjectMotionPathStop {
  return {
    id: crypto.randomUUID(),
    offset,
    target:
      stop.target.kind === 'AREA'
        ? createMotionPathAreaTarget(project, stop.target)
        : createMotionPathPointTarget(project, stop.target, stop.target.scale),
  };
}

function createDefaultMotionPathSegment(): VideoProjectMotionPathSegment {
  return {
    durationWeight: 1,
    easing: VideoTemporalEasing.EASE_IN_OUT,
    trajectoryPreset: VideoMotionPathTrajectoryPreset.LINEAR,
  };
}
