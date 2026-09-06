import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import type { VideoProject } from '../../../features/video/project/types';
import { collectRepresentativeRecordingSourceClips } from './source-timed-clips';
import { buildStableSignalIntersections } from './time-ranges';

export function isRecordingTelemetryEligibleForAutoProcessing(
  project: VideoProject,
  telemetry: RecordingTelemetryEntry | null | undefined
): telemetry is RecordingTelemetryEntry {
  const recordingId = project.baseRecordingId;
  if (!recordingId || telemetry?.recordingId !== recordingId) {
    return false;
  }

  if (collectRepresentativeRecordingSourceClips(project, recordingId).length === 0) {
    return false;
  }

  return (
    telemetry.actionEvents.length > 0 ||
    (telemetry.cursorTrack?.samples.length ?? 0) > 0 ||
    buildStableSignalIntersections(telemetry.signals).length > 0
  );
}
