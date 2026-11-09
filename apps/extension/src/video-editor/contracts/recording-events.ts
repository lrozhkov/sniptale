import type { RecordingEventRecord } from '../../features/video/project/recording-events/types';

/** One selected source fact belongs to UI state, never to the authored project document. */
export interface VideoEditorRecordingActionObservation {
  recordingId: string;
  sourceInstanceId: string;
  eventStreamId: string;
  streamSha256: string;
  record: Extract<RecordingEventRecord, { kind: 'action' }>;
}

/** Cadence remains in the bounded reader. Selection retains one canonical interval fact. */
export interface VideoEditorRecordingSignalObservation {
  eventStreamId: string;
  streamSha256: string;
  record: Extract<RecordingEventRecord, { kind: 'signal' }>;
}
