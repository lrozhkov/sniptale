import { getRecordingTelemetry } from '../../../composition/persistence/recordings/telemetry';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import type { VideoProject, VideoProjectActionEvent } from '../../../features/video/project/types';
import { DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  VideoAutoProcessingAction,
  type VideoAutoProcessingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { VideoProjectActionEventKind } from '../../../features/video/project/types/interaction';
import { buildAutoTransformCandidates } from './auto-transform.candidates';
import { buildAutoZoomRegions } from './auto-transform.zoom';
import {
  applyAutoTransformClipTimeline,
  mapSourceTimeToProjectTime,
} from './auto-transform.clip-timeline';
import {
  createRecordingTelemetryNormalizationParams,
  normalizeRecordingActionEventsToProjectSpace,
  normalizeRecordingCursorTrackToProjectSpace,
} from './telemetry';

function resolveAutoTransformSettings(
  settings: VideoAutoProcessingSettings | undefined
): VideoAutoProcessingSettings {
  return (
    settings ?? {
      ...DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS,
      enabled: true,
    }
  );
}

function rebuildRecordingActionEvents(params: {
  project: VideoProject;
  recordingId: string;
  telemetry: RecordingTelemetryEntry;
}): VideoProjectActionEvent[] {
  const normalizedActions = normalizeRecordingActionEventsToProjectSpace(
    params.telemetry.actionEvents,
    createRecordingTelemetryNormalizationParams(params.telemetry, params.project)
  );
  const recordingActions = normalizedActions
    .map<VideoProjectActionEvent | null>((event) => {
      const time = mapSourceTimeToProjectTime(params.project, params.recordingId, event.time);
      return time === null
        ? null
        : {
            ...event,
            time,
            data: {
              ...event.data,
              recordingTelemetry: true,
            },
          };
    })
    .filter((event): event is VideoProjectActionEvent => event !== null);
  const manualEvents = params.project.actionEvents.filter(
    (event) =>
      event.kind === VideoProjectActionEventKind.PAUSE ||
      event.kind === VideoProjectActionEventKind.CALLOUT
  );

  return [...manualEvents, ...recordingActions].sort((left, right) => left.time - right.time);
}

function rebuildRecordingCursorTrack(params: {
  project: VideoProject;
  recordingId: string;
  telemetry: RecordingTelemetryEntry;
}): VideoProject['cursorTrack'] {
  const normalizedTrack = normalizeRecordingCursorTrackToProjectSpace(
    params.telemetry.cursorTrack,
    createRecordingTelemetryNormalizationParams(params.telemetry, params.project)
  );

  if (!normalizedTrack) {
    return params.project.cursorTrack;
  }

  return {
    ...normalizedTrack,
    samples: normalizedTrack.samples
      .map((sample) => {
        const time = mapSourceTimeToProjectTime(params.project, params.recordingId, sample.time);
        return time === null ? null : { ...sample, time };
      })
      .filter((sample): sample is NonNullable<typeof sample> => sample !== null),
  };
}

export async function autoTransformRecordingProject(
  project: VideoProject,
  recordingId: string,
  settings?: VideoAutoProcessingSettings
): Promise<VideoProject | null> {
  const resolvedSettings = resolveAutoTransformSettings(settings);
  if (
    !resolvedSettings.enabled ||
    resolvedSettings.stableSegments.action === VideoAutoProcessingAction.SKIP
  ) {
    return project;
  }

  const telemetry = await getRecordingTelemetry(recordingId);
  if (!telemetry) {
    return null;
  }

  let nextProject = applyAutoTransformClipTimeline(
    project,
    recordingId,
    buildAutoTransformCandidates(telemetry, resolvedSettings.stableSegments)
  );
  nextProject = {
    ...nextProject,
    actionEvents: rebuildRecordingActionEvents({
      project: nextProject,
      recordingId,
      telemetry,
    }),
    cursorTrack: rebuildRecordingCursorTrack({
      project: nextProject,
      recordingId,
      telemetry,
    }),
  };

  return {
    ...nextProject,
    motionRegions: buildAutoZoomRegions({
      project: nextProject,
      recordingId,
      telemetry,
    }),
  };
}
