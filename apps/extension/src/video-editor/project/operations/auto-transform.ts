import { getRecordingTelemetry } from '../../../composition/persistence/recordings/telemetry';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import type { VideoProject, VideoProjectActionEvent } from '../../../features/video/project/types';
import { DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  VideoAutoProcessingAction,
  type VideoAutoProcessingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import {
  VideoProjectActionEventKind,
  VideoProjectInteractionTimeBasis,
} from '../../../features/video/project/types/interaction';
import { buildAutoTransformCandidates } from './auto-transform.candidates';
import { buildAutoZoomRegions } from './auto-transform.zoom';
import { applyAutoTransformClipTimeline } from './auto-transform.clip-timeline';
import {
  createRecordingTelemetryNormalizationParams,
  normalizeRecordingActionEventsToProjectSpace,
  normalizeRecordingCursorTrackToProjectSpace,
} from './telemetry';
import { isRecordingTelemetryEligibleForAutoProcessing } from './telemetry-eligibility';
import { mapSourceTimeToProjectPoint } from '../../../features/video/project/timeline/source-time';
import { collectRepresentativeRecordingSourceClips } from './source-timed-clips';

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
  const sourceClips = collectRepresentativeRecordingSourceClips(params.project, params.recordingId);
  const recordingActions = normalizedActions
    .map<VideoProjectActionEvent | null>((event) => {
      const point = mapSourceTimeToProjectPoint(sourceClips, event.time);
      return point === null
        ? null
        : {
            ...event,
            ...(point
              ? {
                  sourceAnchor: {
                    kind: 'recording-source' as const,
                    recordingId: params.recordingId,
                    sourceClipId: point.clipId,
                    sourceTime: event.time,
                  },
                }
              : {}),
            time: point.time,
            data: {
              ...event.data,
              recordingTelemetry: true,
            },
          };
    })
    .filter((event): event is VideoProjectActionEvent => event !== null);
  const manualEvents = params.project.actionEvents.filter(
    (event) =>
      event.timeBasis === VideoProjectInteractionTimeBasis.PROJECT ||
      event.kind === VideoProjectActionEventKind.PAUSE ||
      event.kind === VideoProjectActionEventKind.CALLOUT
  );
  const manualEventIds = new Set(manualEvents.map((event) => event.id));

  return [
    ...manualEvents,
    ...recordingActions.filter((event) => !manualEventIds.has(event.id)),
  ].sort((left, right) => left.time - right.time);
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

  const sourceClips = collectRepresentativeRecordingSourceClips(params.project, params.recordingId);
  const manualSamples =
    params.project.cursorTrack?.samples.filter(
      (sample) => sample.timeBasis === VideoProjectInteractionTimeBasis.PROJECT
    ) ?? [];
  const manualSampleIds = new Set(manualSamples.map((sample) => sample.id));

  return {
    ...normalizedTrack,
    samples: [
      ...manualSamples,
      ...normalizedTrack.samples
        .filter((sample) => !manualSampleIds.has(sample.id))
        .map((sample) => {
          const point = mapSourceTimeToProjectPoint(sourceClips, sample.time);
          return point === null
            ? null
            : {
                ...sample,
                sourceAnchor: {
                  kind: 'recording-source' as const,
                  recordingId: params.recordingId,
                  sourceClipId: point.clipId,
                  sourceTime: sample.time,
                },
                time: point.time,
              };
        })
        .filter((sample): sample is NonNullable<typeof sample> => sample !== null),
    ].sort((left, right) => left.time - right.time),
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
  if (!isRecordingTelemetryEligibleForAutoProcessing(project, telemetry)) {
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
