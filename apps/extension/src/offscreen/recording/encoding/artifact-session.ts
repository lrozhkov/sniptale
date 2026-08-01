import type { RecordingStagingCoordinator } from '../../../composition/persistence/recordings/staging';
import {
  RecordingArtifactSessionOwner,
  type RecordingArtifactSession,
} from './artifact-session-owner';

interface CreateRecordingArtifactSessionInput {
  artifactId: string;
  coordinator: RecordingStagingCoordinator;
  filename: string;
  mimeType: string;
  recorderOptions: MediaRecorderOptions;
  stream: MediaStream;
}

export type { RecordingArtifactSession } from './artifact-session-owner';

export async function createRecordingArtifactSession(
  input: CreateRecordingArtifactSessionInput
): Promise<RecordingArtifactSession> {
  const writer = await input.coordinator.openArtifact({
    artifactId: input.artifactId,
    filename: input.filename,
    mimeType: input.mimeType,
  });
  try {
    return new RecordingArtifactSessionOwner({
      artifactId: input.artifactId,
      coordinator: input.coordinator,
      recorderOptions: input.recorderOptions,
      stream: input.stream,
      writer,
    });
  } catch (error) {
    await input.coordinator.abort().catch(() => undefined);
    throw error;
  }
}
