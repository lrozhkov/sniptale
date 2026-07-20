import { createDefaultMotionPath } from '../../../features/video/project/motion/path';
import { createMotionPathPointTarget } from '../../../features/video/project/motion/path-targets';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import {
  type VideoProject,
  type VideoProjectMotionPath,
  type VideoProjectMotionPathSegment,
  type VideoProjectMotionPathStop,
  type VideoProjectMotionRegion,
  VideoMotionPathTrajectoryPreset,
  VideoTemporalEasing,
} from '../../../features/video/project/types/index';
import {
  createRecordingTelemetryNormalizationParams,
  normalizeRecordingActionEventsToProjectSpace,
  normalizeRecordingCursorTrackToProjectSpace,
} from '../operations/telemetry';
import { isDistinctCursorTarget } from './cursor-targets';

export function createGeneratedMotionPathFromTelemetry(params: {
  project: Pick<VideoProject, 'height' | 'width'>;
  region: Pick<
    VideoProjectMotionRegion,
    'focusArea' | 'focusMode' | 'focusPoint' | 'path' | 'scale'
  >;
  telemetry: RecordingTelemetryEntry | null;
}): VideoProjectMotionPath {
  const basePath = params.region.path ?? createDefaultMotionPath(params.project, params.region);
  if (!params.telemetry) {
    return basePath;
  }

  const targets = createTelemetryMotionPathTargets({
    project: params.project,
    region: params.region,
    telemetry: params.telemetry,
  });

  if (targets.length < 2) {
    return basePath;
  }

  const stops = createMotionPathStopsFromTargets(targets);
  return {
    segments: Array.from({ length: Math.max(1, stops.length - 1) }, () =>
      createDefaultMotionPathSegment()
    ),
    stops,
  };
}

function createDefaultMotionPathSegment(): VideoProjectMotionPathSegment {
  return {
    durationWeight: 1,
    easing: VideoTemporalEasing.EASE_IN_OUT,
    trajectoryPreset: VideoMotionPathTrajectoryPreset.LINEAR,
  };
}

function createTelemetryMotionPathTargets(params: {
  project: Pick<VideoProject, 'height' | 'width'>;
  region: Pick<VideoProjectMotionRegion, 'scale'>;
  telemetry: RecordingTelemetryEntry;
}) {
  const normalizationParams = createRecordingTelemetryNormalizationParams(
    params.telemetry,
    params.project
  );
  const normalizedCursorTrack = normalizeRecordingCursorTrackToProjectSpace(
    params.telemetry.cursorTrack,
    normalizationParams
  );
  const normalizedActionEvents = normalizeRecordingActionEventsToProjectSpace(
    params.telemetry.actionEvents,
    normalizationParams
  );

  return [
    ...createCursorTargets(params.project, params.region.scale, normalizedCursorTrack),
    ...createActionTargets(params.project, params.region.scale, normalizedActionEvents),
  ].slice(0, 5);
}

function createMotionPathStopsFromTargets(
  targets: ReturnType<typeof createTelemetryMotionPathTargets>
): VideoProjectMotionPathStop[] {
  return targets.map((target, index) => ({
    id: crypto.randomUUID(),
    offset: index / (targets.length - 1),
    target,
  }));
}

function createCursorTargets(
  project: Pick<VideoProject, 'height' | 'width'>,
  scale: number,
  cursorTrack: ReturnType<typeof normalizeRecordingCursorTrackToProjectSpace>
) {
  return (
    cursorTrack?.samples
      .filter((sample) => sample.visible)
      .filter((sample, index, samples) => isDistinctCursorTarget(sample, index, samples))
      .slice(0, 4)
      .map((sample) => createMotionPathPointTarget(project, { x: sample.x, y: sample.y }, scale)) ??
    []
  );
}

function createActionTargets(
  project: Pick<VideoProject, 'height' | 'width'>,
  scale: number,
  actionEvents: ReturnType<typeof normalizeRecordingActionEventsToProjectSpace>
) {
  return actionEvents
    .filter((event) => event.point !== null)
    .slice(0, 2)
    .map((event) => createMotionPathPointTarget(project, event.point!, Math.max(scale, 1.35)));
}
