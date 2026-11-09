import { resolveVideoProjectActionOccurrences } from '../../../features/video/project/action-occurrences';
import { isRecordingEventRecord } from '../../../features/video/project/recording-events/records';
import {
  projectRecordingEventAction,
  projectRecordingEventSignal,
  recordingEventActionRecord,
  recordingEventSignalRecord,
  recordingEventProjectActions,
  recordingEventProjectSignals,
  recordingEventProjectSources,
} from '../../../features/video/project/recording-events/project-facts';
import type {
  VideoProject,
  VideoProjectActionEvent,
  RecordingTelemetrySignal,
} from '../../../features/video/project/types';
import type {
  VideoEditorRecordingActionObservation,
  VideoEditorRecordingSignalObservation,
} from '../../contracts/recording-events';
import type { VideoEditorTypingSpanTarget } from '../../contracts/commands/timeline';

function descriptorFor(
  project: VideoProject,
  identity: { recordingId: string; sourceInstanceId: string }
) {
  const group = project.actionFeedback?.find(
    (group) =>
      group.recordingId === identity.recordingId &&
      group.sourceInstanceId === identity.sourceInstanceId
  );
  return group?.events && group.events.totalBlocks > 0 ? group.events : undefined;
}
/** Copies one verified render fact before the selection outlives its viewport window. */
export function recordingActionObservation(
  project: VideoProject,
  event: VideoProjectActionEvent
): VideoEditorRecordingActionObservation | undefined {
  const anchor = event.anchor;
  const record = recordingEventActionRecord(event);
  if (
    anchor.kind !== 'recording-source' ||
    !record ||
    !recordingEventProjectActions(project).some(
      (item) => recordingEventActionRecord(item) === record
    )
  )
    return undefined;
  const descriptor = descriptorFor(project, anchor);
  if (
    !descriptor ||
    !recordingEventProjectSources(project).some(
      (source) =>
        source.recordingId === anchor.recordingId &&
        source.eventStreamId === descriptor.eventStreamId
    )
  )
    return undefined;
  return record
    ? {
        recordingId: anchor.recordingId,
        sourceInstanceId: anchor.sourceInstanceId,
        eventStreamId: descriptor.eventStreamId,
        streamSha256: descriptor.streamSha256,
        record: structuredClone(record),
      }
    : undefined;
}

/** An observed action must still belong to the current source contract and retained placement. */
export function resolveRecordingActionOccurrences(
  project: VideoProject,
  observed?: VideoEditorRecordingActionObservation
) {
  if (!observed) return resolveVideoProjectActionOccurrences(project);
  if (!isRecordingEventRecord(observed.record) || observed.record.kind !== 'action') return [];
  const descriptor = descriptorFor(project, observed);
  if (
    !descriptor ||
    descriptor.eventStreamId !== observed.eventStreamId ||
    descriptor.streamSha256 !== observed.streamSha256
  )
    return [];
  const group = project.actionFeedback!.find(
    (item) =>
      item.recordingId === observed.recordingId &&
      item.sourceInstanceId === observed.sourceInstanceId
  )!;
  const event = projectRecordingEventAction(group, observed.record);
  return resolveVideoProjectActionOccurrences(project, [event]).filter(
    (item) => item.event === event
  );
}

/** Copies one source signal. Cadence remains in the bounded recording reader. */
export function recordingSignalObservation(
  project: VideoProject,
  identity: { recordingId: string; sourceInstanceId: string },
  signal: RecordingTelemetrySignal
): VideoEditorRecordingSignalObservation | undefined {
  const group = project.actionFeedback?.find(
    (group) =>
      group.recordingId === identity.recordingId &&
      group.sourceInstanceId === identity.sourceInstanceId
  );
  const descriptor = descriptorFor(project, identity);
  if (!group || !descriptor || !recordingEventProjectSignals(project, group).includes(signal))
    return undefined;
  const record = recordingEventSignalRecord(signal);
  return record
    ? {
        eventStreamId: descriptor.eventStreamId,
        streamSha256: descriptor.streamSha256,
        record: structuredClone(record),
      }
    : undefined;
}

/** The source-range owner repeats placement admission before it uses this selected interval. */
export function resolveRecordingSignalObservation(
  project: VideoProject,
  target: VideoEditorTypingSpanTarget
): RecordingTelemetrySignal | null {
  const observed = target.observedSignal;
  const descriptor = descriptorFor(project, target);
  if (
    !observed ||
    !descriptor ||
    descriptor.eventStreamId !== observed.eventStreamId ||
    descriptor.streamSha256 !== observed.streamSha256 ||
    !isRecordingEventRecord(observed.record) ||
    observed.record.kind !== 'signal' ||
    observed.record.signal.id !== target.signalId
  )
    return null;
  const signal = projectRecordingEventSignal(observed.record);
  return signal.kind === 'typing' ? signal : null;
}
