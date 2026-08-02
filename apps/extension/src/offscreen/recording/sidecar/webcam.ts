import {
  buildWebcamRecordingId,
  WEBCAM_RECORDING_FILENAME_SUFFIX,
} from '@sniptale/runtime-contracts/video/types/sidecar';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import {
  buildWebcamQualityConstraints,
  resolveWebcamFrameRatePresetValue,
  resolveWebcamQualitySettings,
} from '@sniptale/runtime-contracts/video/types/webcam-quality';
import type { RecordingSidecarRecorder } from './types';
import {
  buildVideoMediaRecorderOptions,
  resolveVideoRecordingFrameRate,
} from '../../../platform/media-utils/video-recording';
import { createFixedVideoOutputStream } from '../stream/fixed-video-output';
import type { RecordingStagingCoordinator } from '../../../composition/persistence/recordings/staging';
import { createRecordingArtifactSession } from '../encoding/artifact-session';
import { buildSidecarFilename } from '../finalizer';
import { resolveVideoRecordingArtifact } from '../../../platform/media-utils/video-recording';

function buildWebcamVideoConstraints(settings: VideoRecordingSettings): MediaTrackConstraints {
  return {
    ...(settings.webcamDeviceId ? { deviceId: { exact: settings.webcamDeviceId } } : {}),
    ...buildWebcamQualityConstraints(resolveWebcamQualitySettings(settings)),
  };
}

function resolveWebcamEncoderFrameRate(params: {
  liveCeiling: number;
  selected: number | null;
  source: number | undefined;
}): number {
  const requested = params.source ?? params.selected ?? params.liveCeiling;
  return Number.isFinite(requested) && requested > 0
    ? Math.min(requested, params.liveCeiling)
    : params.liveCeiling;
}

async function createWebcamMediaRecorder(params: {
  baseRecordingId: string;
  coordinator: RecordingStagingCoordinator;
  settings: VideoRecordingSettings;
  stream: MediaStream;
}): Promise<RecordingSidecarRecorder> {
  if (params.stream.getVideoTracks().length === 0) {
    params.stream.getTracks().forEach((track) => track.stop());
    throw new Error('Webcam sidecar stream is missing a video track.');
  }

  const videoTrack = params.stream.getVideoTracks()[0]!;
  const sourceTrackSettings = videoTrack.getSettings();
  const selectedWebcamFrameRate = resolveWebcamFrameRatePresetValue(
    resolveWebcamQualitySettings(params.settings).frameRate
  );
  const frameRate = resolveWebcamEncoderFrameRate({
    liveCeiling: resolveVideoRecordingFrameRate(params.settings),
    selected: selectedWebcamFrameRate,
    source: sourceTrackSettings.frameRate,
  });
  const normalized = await createFixedVideoOutputStream(params.stream, params.settings, {
    contentHint: 'motion',
    frameRate,
  });
  try {
    const trackSettings = {
      ...normalized.dimensions,
      frameRate: normalized.frameRate,
    };
    const recorderOptions = buildVideoMediaRecorderOptions(
      params.settings,
      normalized.stream,
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
      stream: normalized.stream,
    });
    const recorder = artifactSession.recorder;
    const sidecar: RecordingSidecarRecorder = {
      artifact: null,
      artifactSession,
      filenameSuffix: WEBCAM_RECORDING_FILENAME_SUFFIX,
      kind: 'webcam',
      recorder,
      recordingId,
      stream: normalized.stream,
      trackSettings,
    };

    return sidecar;
  } catch (error) {
    normalized.stream.getTracks().forEach((track) => track.stop());
    throw error;
  }
}

export async function createWebcamSidecarRecorder(params: {
  baseRecordingId: string;
  coordinator: RecordingStagingCoordinator;
  settings: VideoRecordingSettings;
}): Promise<RecordingSidecarRecorder | null> {
  if (!params.settings.webcamEnabled) {
    return null;
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: buildWebcamVideoConstraints(params.settings),
  });

  return createWebcamMediaRecorder({
    baseRecordingId: params.baseRecordingId,
    coordinator: params.coordinator,
    settings: params.settings,
    stream,
  });
}
