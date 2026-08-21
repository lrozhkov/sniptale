import type { RecordingStagingCoordinator } from '../../../composition/persistence/recordings/staging';
import {
  LiveRecordingArtifactSessionOwner,
  type LiveRecordingArtifactSession,
  type LiveRecordingEncodingConfig,
} from './live-artifact-session-owner';

interface CreateLiveRecordingArtifactSessionInput {
  artifactId: string;
  coordinator: RecordingStagingCoordinator;
  encoding: LiveRecordingEncodingConfig;
  filename: string;
  frameCrop?: { x: number; y: number; width: number; height: number };
  mimeType: string;
  stream: MediaStream;
}

export type {
  LiveRecordingArtifactSession,
  LiveRecordingEncodingConfig,
} from './live-artifact-session-owner';

export async function createLiveRecordingArtifactSession(
  input: CreateLiveRecordingArtifactSessionInput
): Promise<LiveRecordingArtifactSession> {
  const writer = await input.coordinator.openArtifact({
    artifactId: input.artifactId,
    filename: input.filename,
    mimeType: input.mimeType,
  });
  const ownerInput = {
    artifactId: input.artifactId,
    coordinator: input.coordinator,
    encoding: input.encoding,
    ...(input.frameCrop ? { frameCrop: input.frameCrop } : {}),
    stream: input.stream,
    writer,
  };
  try {
    await LiveRecordingArtifactSessionOwner.assertSupported(ownerInput);
    return new LiveRecordingArtifactSessionOwner(ownerInput);
  } catch (error) {
    await input.coordinator.abort().catch(() => undefined);
    throw error;
  }
}
