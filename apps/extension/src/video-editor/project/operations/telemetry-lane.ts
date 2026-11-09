import { recordingEventProjectSignals } from '../../../features/video/project/recording-events/project-facts';
import { recordingSignalObservation } from './recording-events-selection';
import type { VideoEditorRecordingSignalObservation } from '../../contracts/recording-events';
import { normalizeRecordingSignals } from '../../../features/video/project/recording-actions';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import { type SourceTimedProjectSpan } from '../../../features/video/project/timeline/source-time';
import { mapSourceRangeToProjectSpans } from '../../../features/video/project/timeline/source-time';
import type { VideoProject, RecordingTelemetrySignal } from '../../../features/video/project/types';
import { RecordingTelemetrySignalKind } from '../../../features/video/project/types/interaction';
import { collectRepresentativeRecordingSourceClips } from './source-timed-clips';

interface TimelineTelemetryLaneSpan {
  observedSignal?: VideoEditorRecordingSignalObservation;
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
  signals: readonly RecordingTelemetrySignal[],
  clips = collectRepresentativeRecordingSourceClips(project, recordingId),
  observations = new Map<string, VideoEditorRecordingSignalObservation>()
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
          ...(observations.has(idPrefix) ? { observedSignal: observations.get(idPrefix)! } : {}),
        },
      ];
    });
  const typingSignals = normalizeRecordingSignals([...signals]).filter(
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
    spans: buildTelemetryLaneSpans(
      project,
      recordingId,
      telemetry.signals,
      collectRepresentativeRecordingSourceClips(project, recordingId).filter(
        (clip) =>
          !project.actionFeedback?.some(
            (group) =>
              group.recordingId === recordingId &&
              group.sourceInstanceId === clip.sourceInstanceId &&
              group.events
          )
      )
    ),
  };
}

/** Combines legacy telemetry and prepared stream windows for each source placement. */
export function buildProjectTimelineTelemetryLaneData(
  project: VideoProject,
  telemetry: readonly RecordingTelemetryEntry[]
): TimelineTelemetryLaneData {
  const spans = telemetry.flatMap(
    (entry) => buildTimelineTelemetryLaneData(project, entry.recordingId, entry).spans
  );
  for (const group of project.actionFeedback ?? []) {
    if (!group.events) continue;
    const signals = recordingEventProjectSignals(project, group);
    const observations = new Map<string, VideoEditorRecordingSignalObservation>();
    for (const signal of signals) {
      const observation = recordingSignalObservation(project, group, signal);
      if (observation) observations.set(signal.id, observation);
    }
    const clips = collectRepresentativeRecordingSourceClips(project, group.recordingId).filter(
      (clip) => clip.sourceInstanceId === group.sourceInstanceId
    );
    spans.push(
      ...buildTelemetryLaneSpans(project, group.recordingId, signals, clips, observations)
    );
  }
  return { spans: spans.sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime) };
}
