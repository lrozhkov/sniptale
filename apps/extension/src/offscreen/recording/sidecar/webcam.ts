import {
  buildWebcamRecordingId,
  WEBCAM_RECORDING_FILENAME_SUFFIX,
} from '@sniptale/runtime-contracts/video/types/sidecar';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import {
  buildWebcamQualityConstraints,
  resolveWebcamQualitySettings,
} from '@sniptale/runtime-contracts/video/types/webcam-quality';
import type { RecordingSidecarRecorder } from './types';
import { buildVideoMediaRecorderOptions } from '../recorder-mime';

function buildWebcamVideoConstraints(settings: VideoRecordingSettings): MediaTrackConstraints {
  return {
    ...(settings.webcamDeviceId ? { deviceId: { exact: settings.webcamDeviceId } } : {}),
    ...buildWebcamQualityConstraints(resolveWebcamQualitySettings(settings)),
  };
}

function createWebcamMediaRecorder(params: {
  baseRecordingId: string;
  settings: VideoRecordingSettings;
  stream: MediaStream;
}): RecordingSidecarRecorder {
  if (params.stream.getVideoTracks().length === 0) {
    throw new Error('Webcam sidecar stream is missing a video track.');
  }

  const videoTrack = params.stream.getVideoTracks()[0]!;
  const sidecar: RecordingSidecarRecorder = {
    chunks: [],
    filenameSuffix: WEBCAM_RECORDING_FILENAME_SUFFIX,
    kind: 'webcam',
    recorder: new MediaRecorder(params.stream, buildVideoMediaRecorderOptions(params.settings)),
    recordingId: buildWebcamRecordingId(params.baseRecordingId),
    stream: params.stream,
    trackSettings: videoTrack.getSettings(),
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

  try {
    return createWebcamMediaRecorder({
      baseRecordingId: params.baseRecordingId,
      settings: params.settings,
      stream,
    });
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    throw error;
  }
}
