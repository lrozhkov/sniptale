import { RECORDING_EXPORT_FILENAME_PREFIX } from '@sniptale/ui/branding';
import { createLogger } from '@sniptale/platform/observability/logger';
import { commitVideoProjectMutation } from '../../../composition/persistence/projects/index-mutations';
import { saveRecordingsBatchWithCompletionSafely } from '../../../workflows/media-hub/store';
import { loadSettings } from '../../../composition/persistence/settings';
import { DEFAULT_LOCAL_STORAGE_POLICY } from '../../../composition/persistence/library-lifecycle';
import { updateVideoRecordingCompletionOutbox } from '../../../composition/persistence/recordings/completion-outbox';
import {
  createVideoProjectFromMultiSourceRecording,
  type MultiSourceAudioProjectAssetInput,
  type MultiSourceRecordingProjectAssetInput,
} from '../../../features/video/project/factories/multi-source-recording';
import { notifyMultiSourceSaved, notifyMultiSourceStopped } from './messages';
import type { MultiSourceRecorder, MultiSourceSession } from './state';
import { createWebcamProjectInput } from './webcam';
import { requireRecordingDimensions } from './dimensions';
import type { RecordingGroupMember } from '../../../features/media-hub/recording-groups';

const logger = createLogger({ namespace: 'OffscreenMultiSourceFinalize' });

async function createProjectForSession(
  videos: MultiSourceRecordingProjectAssetInput[],
  microphoneAudio: MultiSourceAudioProjectAssetInput | null,
  webcamVideo: ReturnType<typeof createWebcamProjectInput>,
  storageClass: 'temporary' | 'library'
): Promise<string | null> {
  try {
    const project = createVideoProjectFromMultiSourceRecording({
      name: `${RECORDING_EXPORT_FILENAME_PREFIX}-multi-source`,
      microphoneAudio,
      videos,
      webcamVideo,
    });
    await commitVideoProjectMutation(project, { baseRevision: null, storageClass });
    return project.id;
  } catch (error) {
    logger.error('Failed to create a multi-source project; preserving raw recordings', error);
    return null;
  }
}

function requireSourceDimensions(source: MultiSourceRecorder): { height: number; width: number } {
  return requireRecordingDimensions(
    source,
    `Multi-source recording dimensions are unavailable for source ${source.sourceIndex + 1}.`
  );
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

function buildRecordingGroupMember(
  session: MultiSourceSession,
  order: number,
  role: RecordingGroupMember['role'],
  sourceLabel: string | null,
  dimensions?: { height: number; width: number }
): RecordingGroupMember {
  return {
    ...(dimensions ? { dimensions } : {}),
    groupId: session.recordingId,
    order,
    role,
    sourceLabel,
  };
}

function buildRecordingBatchInputs(
  session: MultiSourceSession,
  storageClass: 'temporary' | 'library'
) {
  const sourceInputs = session.recorders.map((source, order) => ({
    source,
    recordingGroup: buildRecordingGroupMember(
      session,
      order,
      'display',
      source.label,
      requireSourceDimensions(source)
    ),
  }));
  const microphoneInput = session.audioRecorder
    ? {
        source: session.audioRecorder,
        recordingGroup: buildRecordingGroupMember(session, sourceInputs.length, 'microphone', null),
      }
    : null;
  const webcamInput = session.webcamRecorder
    ? {
        source: session.webcamRecorder,
        recordingGroup: buildRecordingGroupMember(
          session,
          sourceInputs.length + (microphoneInput ? 1 : 0),
          'webcam',
          session.webcamRecorder.sourceLabel,
          requireRecordingDimensions(
            session.webcamRecorder,
            'Webcam recording dimensions are unavailable.'
          )
        ),
      }
    : null;

  return [...sourceInputs, microphoneInput, webcamInput]
    .filter((input): input is NonNullable<typeof input> => input !== null)
    .map(({ recordingGroup, source }) => {
      const artifact = source.artifact!;
      return {
        filename: artifact.filename,
        id: source.recordingId,
        preparedAsset: artifact.asset,
        recordingGroup,
        storageClass,
      };
    });
}

export async function finalizeSession(session: MultiSourceSession): Promise<void> {
  validateSessionForFinalization(session);
  const duration = Math.max(0.1, (Date.now() - session.startedAt) / 1000);
  const primaryRecordingId = session.recorders[0]?.recordingId;
  if (!primaryRecordingId) throw new Error('Multi-source recording has no saved video source.');
  const completion = {
    primaryRecordingId,
    projectId: null,
    recordingId: session.recordingId,
  };
  const settings = await loadSettings().catch(() => null);
  const storageClass =
    settings?.localStoragePolicy.defaultDestination ??
    DEFAULT_LOCAL_STORAGE_POLICY.defaultDestination;
  await saveRecordingsBatchWithCompletionSafely(
    buildRecordingBatchInputs(session, storageClass),
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
  const projectId = await createProjectForSession(
    videos,
    microphoneAudio,
    webcamVideo,
    storageClass
  );
  const publishedCompletion = { ...completion, projectId };
  if (projectId !== null) {
    await updateVideoRecordingCompletionOutbox(publishedCompletion);
  }
  await notifyMultiSourceSaved(publishedCompletion);
  await notifyMultiSourceStopped(session.recordingId);
}
