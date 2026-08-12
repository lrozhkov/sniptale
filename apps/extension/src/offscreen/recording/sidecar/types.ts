import type { FinalizedRecordingStagingArtifact } from '../../../composition/persistence/recordings/staging';
import type { RecordingArtifactSession } from '../encoding/artifact-session';

export type RecordingSidecarRecorder = {
  artifact: FinalizedRecordingStagingArtifact | null;
  artifactSession: RecordingArtifactSession;
  filenameSuffix: string;
  kind: 'webcam';
  recorder: MediaRecorder;
  release: () => void;
  recordingId: string;
  stream: MediaStream;
  trackSettings: MediaTrackSettings;
};

export type RecordingSidecarSession = {
  recorders: RecordingSidecarRecorder[];
  stopPromise: Promise<FinalizedRecordingStagingArtifact[]> | null;
};
