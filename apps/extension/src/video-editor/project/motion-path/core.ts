import {
  createDefaultMotionPath,
  deriveMotionPathStopOffsets,
} from '../../../features/video/project/motion/path';
import type {
  VideoProject,
  VideoProjectMotionPath,
  VideoProjectMotionPathSegment,
  VideoProjectMotionPathStop,
  VideoProjectMotionRegion,
} from '../../../features/video/project/types/index';

export function resolveMotionPath(
  project: Pick<VideoProject, 'height' | 'width'>,
  region: Pick<
    VideoProjectMotionRegion,
    'focusArea' | 'focusMode' | 'focusPoint' | 'path' | 'scale'
  >
): VideoProjectMotionPath {
  return region.path ?? createDefaultMotionPath(project, region);
}

export function updateMotionPathStop(
  path: VideoProjectMotionPath,
  stopId: string,
  updater: (stop: VideoProjectMotionPathStop) => VideoProjectMotionPathStop
): VideoProjectMotionPath {
  return {
    ...path,
    stops: path.stops.map((stop) => (stop.id === stopId ? updater(stop) : stop)),
  };
}

export function updateMotionPathSegment(
  path: VideoProjectMotionPath,
  segmentIndex: number,
  updater: (segment: VideoProjectMotionPathSegment) => VideoProjectMotionPathSegment
): VideoProjectMotionPath {
  return {
    ...path,
    segments: path.segments.map((segment, index) =>
      index === segmentIndex ? updater(segment) : segment
    ),
  };
}

export function rebalanceMotionPathOffsets(path: VideoProjectMotionPath): VideoProjectMotionPath {
  const offsets = deriveMotionPathStopOffsets(path.segments);

  return {
    ...path,
    stops: path.stops.map((stop, index) => ({
      ...stop,
      offset: offsets[index] ?? stop.offset,
    })),
  };
}

export function removeMotionPathStop(
  path: VideoProjectMotionPath,
  stopId: string
): VideoProjectMotionPath {
  const stops = path.stops.filter((stop) => stop.id !== stopId);

  return {
    ...path,
    segments: path.segments.slice(0, Math.max(1, stops.length - 1)),
    stops,
  };
}
