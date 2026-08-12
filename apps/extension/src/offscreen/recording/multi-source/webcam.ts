import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import type { RecordingStagingCoordinator } from '../../../composition/persistence/recordings/staging';
import { createWebcamSidecarRecorder } from '../sidecar';
import type { RecordingSidecarRecorder } from '../sidecar/types';

type WebcamProjectInput = {
  duration: number;
  filename: string;
  height: number;
  mimeType: string;
  recordingId: string;
  size: number;
  width: number;
};

export function createMultiSourceWebcamRecorder(params: {
  baseRecordingId: string;
  coordinator: RecordingStagingCoordinator;
  settings: VideoRecordingSettings;
}): Promise<RecordingSidecarRecorder | null> {
  return createWebcamSidecarRecorder(params);
}

export function stopWebcamRecorderStream(source: RecordingSidecarRecorder | null): void {
  source?.release();
}

export function createWebcamProjectInput(
  source: RecordingSidecarRecorder | null,
  duration: number
): WebcamProjectInput | null {
  if (!source) return null;
  const { artifact } = source;
  if (!artifact || artifact.size <= 0) {
    throw new Error(`Webcam recording ${source.recordingId} has no finalized media.`);
  }
  const { height, width } = source.trackSettings;
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error('Webcam recording dimensions are unavailable.');
  }
  return {
    duration,
    filename: artifact.filename,
    height,
    mimeType: artifact.mimeType,
    recordingId: source.recordingId,
    size: artifact.size,
    width,
  };
}
