import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import {
  isLegacyScrollActionEvent,
  type SourceTimedProjectSpan,
} from '../../../features/video/project/timeline/source-time';
import { mapSourceRangeToProjectSpans } from '../../../features/video/project/timeline/source-time';
import type { VideoProject, VideoProjectActionEvent } from '../../../features/video/project/types';
import {
  RecordingTelemetrySignalKind,
  VideoProjectActionEventKind,
} from '../../../features/video/project/types/interaction';
import { mapSourceTimeToProjectTime } from './auto-transform.clip-timeline';
import {
  createRecordingTelemetryNormalizationParams,
  normalizeRecordingActionEventsToProjectSpace,
} from './telemetry';
import { collectRepresentativeRecordingSourceClips } from './source-timed-clips';
import { buildStableSignalIntersections, mergeTimeRanges } from './time-ranges';

interface TimelineTelemetryLaneMarker {
  id: string;
  kind: 'click' | 'key';
  label: string;
  point: VideoProjectActionEvent['point'];
  time: number;
}

interface TimelineTelemetryLaneSpan {
  endTime: number;
  id: string;
  kind: 'stable' | 'typing';
  sourceEnd: number;
  sourceStart: number;
  startTime: number;
}

interface TimelineTelemetryLaneData {
  markers: TimelineTelemetryLaneMarker[];
  spans: TimelineTelemetryLaneSpan[];
}

function buildTelemetryLaneSpans(
  project: VideoProject,
  recordingId: string,
  telemetry: RecordingTelemetryEntry
): TimelineTelemetryLaneSpan[] {
  const buildSignalSpans = (
    spans: SourceTimedProjectSpan[],
    idPrefix: string,
    kind: TimelineTelemetryLaneSpan['kind']
  ) =>
    spans.map<TimelineTelemetryLaneSpan>((span) => ({
      ...span,
      id: `${idPrefix}:${span.clipId}`,
      kind,
    }));
  const clips = collectRepresentativeRecordingSourceClips(project, recordingId);
  const typingSignals = telemetry.signals.filter(
    (signal) => signal.kind === RecordingTelemetrySignalKind.TYPING
  );
  const typingSpans = typingSignals.flatMap((signal) =>
    buildSignalSpans(
      mapSourceRangeToProjectSpans(clips, signal.startTime, signal.endTime),
      signal.id,
      'typing'
    )
  );
  const stableSpans = mergeTimeRanges(
    buildStableSignalIntersections(telemetry.signals),
    0.05
  ).flatMap((signal, index) =>
    buildSignalSpans(
      mapSourceRangeToProjectSpans(clips, signal.startTime, signal.endTime),
      `stable-${index}`,
      'stable'
    )
  );

  return [...typingSpans, ...stableSpans].sort(
    (left, right) => left.startTime - right.startTime || left.endTime - right.endTime
  );
}

function buildTelemetryLaneMarkers(
  project: VideoProject,
  recordingId: string,
  telemetry: RecordingTelemetryEntry
): TimelineTelemetryLaneMarker[] {
  const normalizedActionEvents = normalizeRecordingActionEventsToProjectSpace(
    telemetry.actionEvents,
    createRecordingTelemetryNormalizationParams(telemetry, project)
  );

  return normalizedActionEvents
    .filter((event) => !isLegacyScrollActionEvent(event))
    .filter(
      (event) =>
        event.kind === VideoProjectActionEventKind.CLICK ||
        event.kind === VideoProjectActionEventKind.KEY
    )
    .map<TimelineTelemetryLaneMarker | null>((event) => {
      const time = mapSourceTimeToProjectTime(project, recordingId, event.time);
      if (time === null) {
        return null;
      }

      return {
        id: event.id,
        kind: event.kind === VideoProjectActionEventKind.KEY ? 'key' : 'click',
        label: event.label,
        point: event.point,
        time,
      };
    })
    .filter((marker): marker is TimelineTelemetryLaneMarker => marker !== null)
    .sort((left, right) => left.time - right.time);
}

export function buildTimelineTelemetryLaneData(
  project: VideoProject,
  recordingId: string,
  telemetry: RecordingTelemetryEntry
): TimelineTelemetryLaneData {
  return {
    markers: buildTelemetryLaneMarkers(project, recordingId, telemetry),
    spans: buildTelemetryLaneSpans(project, recordingId, telemetry),
  };
}
