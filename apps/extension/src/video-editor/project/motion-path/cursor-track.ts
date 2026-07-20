import { createDefaultMotionPath } from '../../../features/video/project/motion/path';
import { createMotionPathPointTarget } from '../../../features/video/project/motion/path-targets';
import type { VideoObjectTrack } from '../../../features/video/project/object-tracks';
import { isCameraCursorObjectTrack } from '../../../features/video/project/object-tracks';
import type {
  VideoProject,
  VideoProjectMotionPath,
  VideoProjectMotionRegion,
} from '../../../features/video/project/types/index';
import {
  VideoMotionPathTrajectoryPreset,
  VideoTemporalEasing,
} from '../../../features/video/project/types/index';
import { isDistinctCursorTarget } from './cursor-targets';

export function createGeneratedMotionPathFromCursorTrack(params: {
  project: Pick<VideoProject, 'height' | 'width'>;
  region: Pick<
    VideoProjectMotionRegion,
    'focusArea' | 'focusMode' | 'focusPoint' | 'path' | 'scale'
  >;
  track: VideoObjectTrack | null;
}): VideoProjectMotionPath {
  const basePath = params.region.path ?? createDefaultMotionPath(params.project, params.region);
  if (!params.track || !isCameraCursorObjectTrack(params.track)) {
    return basePath;
  }

  const targets = createObjectTrackCursorTargets(params.project, params.region.scale, params.track);
  if (targets.length < 2) {
    return basePath;
  }

  return {
    segments: Array.from({ length: targets.length - 1 }, () => ({
      durationWeight: 1,
      easing: VideoTemporalEasing.EASE_IN_OUT,
      trajectoryPreset: VideoMotionPathTrajectoryPreset.LINEAR,
    })),
    stops: targets.map((target, index) => ({
      id: crypto.randomUUID(),
      offset: index / Math.max(1, targets.length - 1),
      target,
    })),
  };
}

export function canGenerateMotionPathFromCursorTrack(params: {
  project: Pick<VideoProject, 'height' | 'width'>;
  region: Pick<VideoProjectMotionRegion, 'scale'>;
  track: VideoObjectTrack | null;
}): boolean {
  if (!params.track || !isCameraCursorObjectTrack(params.track)) {
    return false;
  }
  const targets = createObjectTrackCursorTargets(params.project, params.region.scale, params.track);
  return targets.length >= 2;
}

function createObjectTrackCursorTargets(
  project: Pick<VideoProject, 'height' | 'width'>,
  scale: number,
  track: VideoObjectTrack
) {
  return track.samples
    .filter((sample) => sample.visible)
    .filter((sample, index, samples) => isDistinctCursorTarget(sample, index, samples))
    .slice(0, 6)
    .map((sample) => createMotionPathPointTarget(project, { x: sample.x, y: sample.y }, scale));
}
