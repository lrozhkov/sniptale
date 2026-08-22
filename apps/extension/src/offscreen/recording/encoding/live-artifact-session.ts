import type { RecordingStagingCoordinator } from '../../../composition/persistence/recordings/staging';
import {
  LiveRecordingArtifactSessionOwner,
  type LiveRecordingArtifactSession,
  type LiveRecordingEncodingConfig,
} from './live-artifact-session-owner';
import type { LiveVideoFrameTransform } from './live-video-encoder-pump';

interface CreateLiveRecordingArtifactSessionInput {
  artifactId: string;
  coordinator: RecordingStagingCoordinator;
  encoding: LiveRecordingEncodingConfig;
  filename: string;
  frameTransform?: LiveVideoFrameTransform | undefined;
  mimeType: string;
  stream: MediaStream;
}

export type {
  LiveRecordingArtifactSession,
  LiveRecordingEncodingConfig,
} from './live-artifact-session-owner';
export type { LiveVideoFrameTransform } from './live-video-encoder-pump';

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
    ...(input.frameTransform ? { frameTransform: input.frameTransform } : {}),
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
