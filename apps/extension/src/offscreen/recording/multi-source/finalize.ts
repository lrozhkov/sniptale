import { RECORDING_EXPORT_FILENAME_PREFIX } from '@sniptale/ui/branding';
import { commitVideoProjectMutation } from '../../../composition/persistence/projects/index-mutations';
import { saveRecordingSafely } from '../../../workflows/media-hub/store';
import {
  createVideoProjectFromMultiSourceRecording,
  type MultiSourceAudioProjectAssetInput,
  type MultiSourceRecordingProjectAssetInput,
} from '../../../features/video/project/factories/multi-source-recording';
import {
  notifyMultiSourceSaved,
  notifyMultiSourceStopped,
  triggerMultiSourceDownload,
} from './messages';
import { buildMicrophoneFilename, buildSourceFilename } from './recorders';
import type { MultiSourceRecorder, MultiSourceSession } from './state';
import { createWebcamProjectInput, saveWebcamRecording } from './webcam';

async function saveSourceRecording(source: MultiSourceRecorder, duration: number) {
  const mimeType = source.recorder.mimeType || source.chunks[0]?.type || 'video/webm';
  const blob = new Blob(source.chunks, { type: mimeType });
  const filename = buildSourceFilename(source.sourceIndex);
  await saveRecordingSafely(source.recordingId, blob, filename);
  await triggerMultiSourceDownload(source.recordingId, filename);
  return { blob, filename, mimeType, source, duration };
}

async function saveMicrophoneRecording(source: MultiSourceRecorder, duration: number) {
  const mimeType = source.recorder.mimeType || source.chunks[0]?.type || 'audio/webm';
  const blob = new Blob(source.chunks, { type: mimeType });
  const filename = buildMicrophoneFilename();
  await saveRecordingSafely(source.recordingId, blob, filename);
  await triggerMultiSourceDownload(source.recordingId, filename);
  return { blob, filename, mimeType, source, duration };
}

async function createProjectForSession(
  session: MultiSourceSession,
  videos: MultiSourceRecordingProjectAssetInput[],
  microphoneAudio: MultiSourceAudioProjectAssetInput | null,
  webcamVideo: ReturnType<typeof createWebcamProjectInput>
): Promise<string | null> {
  if (!session.settings.openEditorAfterRecording) {
    return null;
  }

  const project = createVideoProjectFromMultiSourceRecording({
    name: `${RECORDING_EXPORT_FILENAME_PREFIX}-multi-source`,
    videos,
    webcamVideo,
    microphoneAudio,
  });
  await commitVideoProjectMutation(project, { baseRevision: null });
  return project.id;
}

export async function finalizeSession(session: MultiSourceSession): Promise<void> {
  const duration = Math.max(0.1, (Date.now() - session.startedAt) / 1000);
  const videoResults = await Promise.all(
    session.recorders.map((source) => saveSourceRecording(source, duration))
  );
  const audioResult = session.audioRecorder
    ? await saveMicrophoneRecording(session.audioRecorder, duration)
    : null;
  const webcamResult = session.webcamRecorder
    ? await saveWebcamRecording(session.webcamRecorder, duration)
    : null;
  const videos = videoResults.map((result) => ({
    recordingId: result.source.recordingId,
    filename: result.filename,
    width: result.source.trackSettings.width ?? 1920,
    height: result.source.trackSettings.height ?? 1080,
    duration: result.duration,
    mimeType: result.mimeType,
    size: result.blob.size,
  }));
  const microphoneAudio = audioResult
    ? {
        recordingId: audioResult.source.recordingId,
        filename: audioResult.filename,
        duration: audioResult.duration,
        mimeType: audioResult.mimeType,
        size: audioResult.blob.size,
      }
    : null;
  const webcamVideo = createWebcamProjectInput(webcamResult);
  const projectId = await createProjectForSession(session, videos, microphoneAudio, webcamVideo);
  await notifyMultiSourceSaved({
    projectId,
    recordingId: videos[0]?.recordingId ?? session.recordingId,
  });
  await notifyMultiSourceStopped(session.recordingId);
}
