import { normalizeRecordingSignals } from '../../../features/video/project/recording-actions';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import { type SourceTimedProjectSpan } from '../../../features/video/project/timeline/source-time';
import { mapSourceRangeToProjectSpans } from '../../../features/video/project/timeline/source-time';
import type { VideoProject } from '../../../features/video/project/types';
import { RecordingTelemetrySignalKind } from '../../../features/video/project/types/interaction';
import { collectRepresentativeRecordingSourceClips } from './source-timed-clips';

interface TimelineTelemetryLaneSpan {
  endTime: number;
  id: string;
  kind: 'typing' | 'cursor-idle';
  clipId: string;
  recordingId: string;
  sourceInstanceId: string;
  signalId: string;
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
          signalId: idPrefix,
        },
      ];
    });
  const clips = collectRepresentativeRecordingSourceClips(project, recordingId);
  const typingSignals = normalizeRecordingSignals(telemetry.signals).filter(
    (signal) =>
      signal.kind === RecordingTelemetrySignalKind.TYPING ||
      signal.kind === RecordingTelemetrySignalKind.CURSOR_IDLE
  );
  const typingSpans = typingSignals.flatMap((signal) =>
    buildSignalSpans(
      mapSourceRangeToProjectSpans(clips, signal.startTime, signal.endTime),
      signal.id,
      signal.kind === 'typing' ? 'typing' : 'cursor-idle'
    )
  );
  return typingSpans.sort(
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
