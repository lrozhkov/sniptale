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
    const sidecar: RecordingSidecarRecorder = {
      chunks: [],
      filenameSuffix: WEBCAM_RECORDING_FILENAME_SUFFIX,
      kind: 'webcam',
      recorder: new MediaRecorder(
        normalized.stream,
        buildVideoMediaRecorderOptions(params.settings, normalized.stream, trackSettings)
      ),
      recordingId: buildWebcamRecordingId(params.baseRecordingId),
      stream: normalized.stream,
      trackSettings,
    };

    sidecar.recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        sidecar.chunks.push(event.data);
      }
    };
    sidecar.recorder.onerror = () => {
      sidecar.stream.getTracks().forEach((track) => track.stop());
    };

    return sidecar;
  } catch (error) {
    normalized.stream.getTracks().forEach((track) => track.stop());
    throw error;
  }
}

export async function createWebcamSidecarRecorder(params: {
  baseRecordingId: string;
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
    settings: params.settings,
    stream,
  });
}
