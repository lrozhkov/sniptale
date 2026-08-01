import { RECORDING_EXPORT_FILENAME_PREFIX } from '@sniptale/ui/branding';
import { createLogger } from '@sniptale/platform/observability/logger';
import { commitVideoProjectMutation } from '../../../composition/persistence/projects/index-mutations';
import { saveRecordingsBatchWithCompletionSafely } from '../../../workflows/media-hub/store';
import { updateVideoRecordingCompletionOutbox } from '../../../composition/persistence/recordings/completion-outbox';
import {
  createVideoProjectFromMultiSourceRecording,
  type MultiSourceAudioProjectAssetInput,
  type MultiSourceRecordingProjectAssetInput,
} from '../../../features/video/project/factories/multi-source-recording';
import { notifyMultiSourceSaved, notifyMultiSourceStopped } from './messages';
import type { MultiSourceRecorder, MultiSourceSession } from './state';
import { createWebcamProjectInput } from './webcam';

const logger = createLogger({ namespace: 'OffscreenMultiSourceFinalize' });

async function createProjectForSession(
  videos: MultiSourceRecordingProjectAssetInput[],
  microphoneAudio: MultiSourceAudioProjectAssetInput | null,
  webcamVideo: ReturnType<typeof createWebcamProjectInput>
): Promise<string | null> {
  try {
    const project = createVideoProjectFromMultiSourceRecording({
      name: `${RECORDING_EXPORT_FILENAME_PREFIX}-multi-source`,
      microphoneAudio,
      videos,
      webcamVideo,
    });
    await commitVideoProjectMutation(project, { baseRevision: null });
    return project.id;
  } catch (error) {
    logger.error('Failed to create a multi-source project; preserving raw recordings', error);
    return null;
  }
}

function requireSourceDimensions(source: MultiSourceRecorder): { height: number; width: number } {
  const { height, width } = source.trackSettings;
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error(
      `Multi-source recording dimensions are unavailable for source ${source.sourceIndex + 1}.`
    );
  }
  return { height, width };
}

function requireArtifact(source: MultiSourceRecorder) {
  if (!source.artifact || source.artifact.size <= 0) {
    throw new Error(`Recording ${source.recordingId} has no finalized media to save.`);
  }
  return source.artifact;
}

function validateSessionForFinalization(session: MultiSourceSession): void {
  if (session.recorders.length === 0) {
    throw new Error('Multi-source recording has no video sources to save.');
  }
  session.recorders.forEach(requireSourceDimensions);
  session.recorders.forEach(requireArtifact);
  if (session.audioRecorder) requireArtifact(session.audioRecorder);
  if (session.webcamRecorder && !session.webcamRecorder.artifact) {
    throw new Error(`Recording ${session.webcamRecorder.recordingId} has no finalized media.`);
  }
}

function buildVideoProjectInputs(
  session: MultiSourceSession,
  duration: number
): MultiSourceRecordingProjectAssetInput[] {
  return session.recorders.map((source) => {
    const artifact = requireArtifact(source);
    return {
      duration,
      filename: artifact.filename,
      ...requireSourceDimensions(source),
      mimeType: artifact.mimeType,
      recordingId: source.recordingId,
      size: artifact.size,
    };
  });
}

function buildMicrophoneProjectInput(
  source: MultiSourceRecorder | null,
  duration: number
): MultiSourceAudioProjectAssetInput | null {
  if (!source) return null;
  const artifact = requireArtifact(source);
  return {
    duration,
    filename: artifact.filename,
    mimeType: artifact.mimeType,
    recordingId: source.recordingId,
    size: artifact.size,
  };
}

export async function finalizeSession(session: MultiSourceSession): Promise<void> {
  validateSessionForFinalization(session);
  const duration = Math.max(0.1, (Date.now() - session.startedAt) / 1000);
  const sources = [...session.recorders, session.audioRecorder, session.webcamRecorder].filter(
    (source): source is NonNullable<typeof source> => source !== null
  );
  const primaryRecordingId = session.recorders[0]?.recordingId;
  if (!primaryRecordingId) throw new Error('Multi-source recording has no saved video source.');
  const completion = {
    primaryRecordingId,
    projectId: null,
    recordingId: session.recordingId,
  };
  await saveRecordingsBatchWithCompletionSafely(
    sources.map((source) => {
      const artifact = source.artifact!;
      return {
        blob: artifact.file,
        filename: artifact.filename,
        id: source.recordingId,
      };
    }),
    completion
  );
  await session.staging.delete().catch((error) => {
    logger.warn('Committed multi-source staging cleanup failed; orphan recovery will retry', {
      errorMessage: error instanceof Error ? error.message : String(error),
      recordingId: session.recordingId,
    });
  });

  const videos = buildVideoProjectInputs(session, duration);
  const microphoneAudio = buildMicrophoneProjectInput(session.audioRecorder, duration);
  const webcamVideo = createWebcamProjectInput(session.webcamRecorder, duration);
  const projectId = await createProjectForSession(videos, microphoneAudio, webcamVideo);
  const publishedCompletion = { ...completion, projectId };
  if (projectId !== null) {
    await updateVideoRecordingCompletionOutbox(publishedCompletion);
  }
  await notifyMultiSourceSaved(publishedCompletion);
  await notifyMultiSourceStopped(session.recordingId);
}
