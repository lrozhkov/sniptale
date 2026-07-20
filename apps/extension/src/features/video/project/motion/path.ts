import {
  VideoMotionFocusMode,
  VideoMotionPathTargetKind,
  VideoMotionPathTrajectoryPreset,
  VideoTemporalEasing,
  type VideoProject,
  type VideoProjectMotionPath,
  type VideoProjectMotionPathSegment,
  type VideoProjectMotionPathStop,
  type VideoProjectMotionRegion,
} from '../types/index';
import {
  createMotionPathAreaTarget,
  createMotionPathPointTarget,
  resolveMotionPathStopScale,
} from './path-targets';

const MIN_SEGMENT_WEIGHT = 0.05;
const MAX_SEGMENT_WEIGHT = 100;

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getProjectCenter(project: Pick<VideoProject, 'height' | 'width'>) {
  return {
    x: project.width / 2,
    y: project.height / 2,
  };
}

function createDefaultSegment(): VideoProjectMotionPathSegment {
  return {
    durationWeight: 1,
    easing: VideoTemporalEasing.EASE_IN_OUT,
    trajectoryPreset: VideoMotionPathTrajectoryPreset.LINEAR,
  };
}

export function createDefaultMotionPathStop(
  project: Pick<VideoProject, 'height' | 'width'>,
  region: Pick<VideoProjectMotionRegion, 'focusArea' | 'focusMode' | 'focusPoint' | 'scale'>,
  offset: number,
  id = crypto.randomUUID()
): VideoProjectMotionPathStop {
  if (region.focusMode === VideoMotionFocusMode.MANUAL_AREA && region.focusArea) {
    return {
      id,
      offset,
      target: createMotionPathAreaTarget(project, region.focusArea),
    };
  }

  return {
    id,
    offset,
    target: createMotionPathPointTarget(
      project,
      region.focusPoint ?? getProjectCenter(project),
      region.scale
    ),
  };
}

export function createDefaultMotionPath(
  project: Pick<VideoProject, 'height' | 'width'>,
  region: Pick<VideoProjectMotionRegion, 'focusArea' | 'focusMode' | 'focusPoint' | 'scale'>
): VideoProjectMotionPath {
  const start = createDefaultMotionPathStop(project, region, 0);
  const end = createDefaultMotionPathStop(project, region, 1);

  return {
    segments: [createDefaultSegment()],
    stops: [start, end],
  };
}

function normalizeMotionPathStop(
  project: Pick<VideoProject, 'height' | 'width'>,
  stop: VideoProjectMotionPathStop | null | undefined,
  fallback: VideoProjectMotionPathStop
): VideoProjectMotionPathStop {
  if (!stop || typeof stop.id !== 'string') {
    return fallback;
  }

  const target = stop.target;
  if (target?.kind === VideoMotionPathTargetKind.AREA) {
    return {
      id: stop.id,
      offset: clampNumber(Number.isFinite(stop.offset) ? stop.offset : fallback.offset, 0, 1),
      target: createMotionPathAreaTarget(project, target),
    };
  }

  const fallbackPoint =
    fallback.target.kind === VideoMotionPathTargetKind.POINT
      ? fallback.target
      : {
          scale: resolveMotionPathStopScale(project, fallback),
          x: fallback.target.x + fallback.target.width / 2,
          y: fallback.target.y + fallback.target.height / 2,
        };

  return {
    id: stop.id,
    offset: clampNumber(Number.isFinite(stop.offset) ? stop.offset : fallback.offset, 0, 1),
    target: createMotionPathPointTarget(
      project,
      {
        x: target?.kind === VideoMotionPathTargetKind.POINT ? target.x : fallbackPoint.x,
        y: target?.kind === VideoMotionPathTargetKind.POINT ? target.y : fallbackPoint.y,
      },
      target?.kind === VideoMotionPathTargetKind.POINT ? target.scale : fallbackPoint.scale
    ),
  };
}

function normalizeMotionPathSegment(
  segment: VideoProjectMotionPathSegment | null | undefined
): VideoProjectMotionPathSegment {
  return {
    durationWeight: clampNumber(
      Number.isFinite(segment?.durationWeight) ? segment!.durationWeight : 1,
      MIN_SEGMENT_WEIGHT,
      MAX_SEGMENT_WEIGHT
    ),
    easing:
      segment && Object.values(VideoTemporalEasing).includes(segment.easing)
        ? segment.easing
        : VideoTemporalEasing.EASE_IN_OUT,
    trajectoryPreset:
      segment && Object.values(VideoMotionPathTrajectoryPreset).includes(segment.trajectoryPreset)
        ? segment.trajectoryPreset
        : VideoMotionPathTrajectoryPreset.LINEAR,
  };
}

function normalizeMotionPathStopOffsets(
  stops: VideoProjectMotionPathStop[]
): VideoProjectMotionPathStop[] {
  const sortedStops = [...stops].sort((left, right) => left.offset - right.offset);
  if (sortedStops.length < 2) {
    return sortedStops;
  }

  return sortedStops.map((stop, index) => {
    if (index === 0) {
      return { ...stop, offset: 0 };
    }

    if (index === sortedStops.length - 1) {
      return { ...stop, offset: 1 };
    }

    const previousOffset = sortedStops[index - 1]?.offset ?? 0;
    return {
      ...stop,
      offset: clampNumber(stop.offset, previousOffset, 1),
    };
  });
}

export function deriveMotionPathStopOffsets(
  segments: readonly Pick<VideoProjectMotionPathSegment, 'durationWeight'>[]
): number[] {
  if (segments.length === 0) {
    return [0, 1];
  }

  const totalWeight = segments.reduce((sum, segment) => sum + segment.durationWeight, 0);
  let runningWeight = 0;
  return [
    0,
    ...segments.map((segment) => {
      runningWeight += segment.durationWeight;
      return totalWeight <= 0 ? 1 : runningWeight / totalWeight;
    }),
  ];
}

export function normalizeVideoProjectMotionPath(
  project: Pick<VideoProject, 'height' | 'width'>,
  path: VideoProjectMotionPath | null | undefined,
  region: Pick<VideoProjectMotionRegion, 'focusArea' | 'focusMode' | 'focusPoint' | 'scale'>
): VideoProjectMotionPath {
  const fallbackPath = createDefaultMotionPath(project, region);
  const stopCount = Math.max(2, Array.isArray(path?.stops) ? path!.stops.length : 0);
  const fallbackStops = Array.from({ length: stopCount }, (_, index) =>
    createDefaultMotionPathStop(project, region, stopCount === 1 ? 1 : index / (stopCount - 1))
  );
  const stops = normalizeMotionPathStopOffsets(
    fallbackStops.map((fallbackStop, index) =>
      normalizeMotionPathStop(project, path?.stops[index], fallbackStop)
    )
  );
  const segmentCount = Math.max(1, stops.length - 1);
  const segments = Array.from({ length: segmentCount }, (_, index) =>
    normalizeMotionPathSegment(path?.segments[index] ?? fallbackPath.segments[0])
  );

  return {
    segments,
    stops,
  };
}
