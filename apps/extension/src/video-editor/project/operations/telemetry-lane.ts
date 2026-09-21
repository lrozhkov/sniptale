import { normalizeRecordingSignals } from '../../../features/video/project/recording-actions';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import { type SourceTimedProjectSpan } from '../../../features/video/project/timeline/source-time';
import { mapSourceRangeToProjectSpans } from '../../../features/video/project/timeline/source-time';
import type { VideoProject } from '../../../features/video/project/types';
import { RecordingTelemetrySignalKind } from '../../../features/video/project/types/interaction';
import { collectRepresentativeRecordingSourceClips } from './source-timed-clips';
import { buildStableSignalIntersections, mergeTimeRanges } from './time-ranges';

interface TimelineTelemetryLaneSpan {
  endTime: number;
  id: string;
  kind: 'stable' | 'typing';
  clipId: string;
  recordingId: string;
  sourceInstanceId: string;
  signalId: string | null;
  sourceEnd: number;
  sourceStart: number;
  startTime: number;
}

interface TimelineTelemetryLaneData {
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
    spans.flatMap<TimelineTelemetryLaneSpan>((span) => {
      const clip = clips.find((item) => item.id === span.clipId);
      if (!clip?.sourceInstanceId) return [];
      return [
        {
          ...span,
          id: JSON.stringify([recordingId, idPrefix, span.clipId]),
          kind,
          recordingId,
          sourceInstanceId: clip.sourceInstanceId,
          signalId: kind === 'typing' ? idPrefix : null,
        },
      ];
    });
  const clips = collectRepresentativeRecordingSourceClips(project, recordingId);
  const typingSignals = normalizeRecordingSignals(telemetry.signals).filter(
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

export function buildTimelineTelemetryLaneData(
  project: VideoProject,
  recordingId: string,
  telemetry: RecordingTelemetryEntry
): TimelineTelemetryLaneData {
  if (telemetry.recordingId !== recordingId) return { spans: [] };
  return {
    spans: buildTelemetryLaneSpans(project, recordingId, telemetry),
  };
}
