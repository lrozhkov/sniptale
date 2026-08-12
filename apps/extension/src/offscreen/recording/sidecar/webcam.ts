import {
  buildWebcamRecordingId,
  WEBCAM_RECORDING_FILENAME_SUFFIX,
} from '@sniptale/runtime-contracts/video/types/sidecar';
import {
  WebcamPresentationMode,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import type { RecordingSidecarRecorder } from './types';
import { buildVideoMediaRecorderOptions } from '../../../platform/media-utils/video-recording';
import type { RecordingStagingCoordinator } from '../../../composition/persistence/recordings/staging';
import { createRecordingArtifactSession } from '../encoding/artifact-session';
import { buildSidecarFilename } from '../finalizer';
import { resolveVideoRecordingArtifact } from '../../../platform/media-utils/video-recording';
import { acquireCameraSource, type CameraSourceLease } from '../camera-source/session';
import { closeAllCameraSourcePeers } from '../camera-source/peer';

async function createWebcamMediaRecorder(params: {
  baseRecordingId: string;
  coordinator: RecordingStagingCoordinator;
  source: CameraSourceLease;
  settings: VideoRecordingSettings;
}): Promise<RecordingSidecarRecorder> {
  if (params.source.stream.getVideoTracks().length === 0) {
    params.source.release();
    throw new Error('Webcam sidecar stream is missing a video track.');
  }

  try {
    const trackSettings = params.source.trackSettings;
    const recorderOptions = buildVideoMediaRecorderOptions(
      params.settings,
      params.source.stream,
      trackSettings
    );
    const artifact = resolveVideoRecordingArtifact(recorderOptions.mimeType ?? '');
    const recordingId = buildWebcamRecordingId(params.baseRecordingId);
    const artifactSession = await createRecordingArtifactSession({
      artifactId: recordingId,
      coordinator: params.coordinator,
      filename: buildSidecarFilename(WEBCAM_RECORDING_FILENAME_SUFFIX, artifact.mimeType),
      mimeType: artifact.mimeType,
      recorderOptions,
      stream: params.source.stream,
    });
    const recorder = artifactSession.recorder;
    const sidecar: RecordingSidecarRecorder = {
      artifact: null,
      artifactSession,
      filenameSuffix: WEBCAM_RECORDING_FILENAME_SUFFIX,
      kind: 'webcam',
      recorder,
      release: params.source.release,
      recordingId,
      stream: params.source.stream,
      trackSettings,
    };

    return sidecar;
  } catch (error) {
    params.source.release();
    throw error;
  }
}

export async function createWebcamSidecarRecorder(params: {
  baseRecordingId: string;
  coordinator: RecordingStagingCoordinator;
  settings: VideoRecordingSettings;
}): Promise<RecordingSidecarRecorder | null> {
  if (
    !params.settings.webcamEnabled ||
    params.settings.webcamPresentation?.mode === WebcamPresentationMode.EMBEDDED
  ) {
    return null;
  }

  // A popup presentation change can race the content preview effect cleanup.
  // Retire every embedded preview lease before acquiring the quality-preserving
  // separate-track source, so the recorder never inherits the 640/30 preview profile.
  closeAllCameraSourcePeers();
  const source = await acquireCameraSource(params.settings);

  return createWebcamMediaRecorder({
    baseRecordingId: params.baseRecordingId,
    coordinator: params.coordinator,
    settings: params.settings,
    source,
  });
}
