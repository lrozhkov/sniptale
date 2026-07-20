import { saveRecordingSafely } from '../../../workflows/media-hub/store';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import { buildSidecarFilename } from '../finalizer';
import { createWebcamSidecarRecorder } from '../sidecar';
import type { RecordingSidecarRecorder } from '../sidecar/types';
import { triggerMultiSourceDownload } from './messages';

type SavedWebcamRecording = {
  blob: Blob;
  duration: number;
  filename: string;
  mimeType: string;
  source: RecordingSidecarRecorder;
};

type WebcamProjectInput = {
  recordingId: string;
  filename: string;
  width: number;
  height: number;
  duration: number;
  mimeType: string;
  size: number;
};

export function createMultiSourceWebcamRecorder(params: {
  baseRecordingId: string;
  settings: VideoRecordingSettings;
}): Promise<RecordingSidecarRecorder | null> {
  return createWebcamSidecarRecorder(params);
}

export function stopWebcamRecorderStream(source: RecordingSidecarRecorder | null): void {
  source?.stream.getTracks().forEach((track) => track.stop());
}

export async function saveWebcamRecording(
  source: RecordingSidecarRecorder,
  duration: number
): Promise<SavedWebcamRecording> {
  const mimeType = source.recorder.mimeType || source.chunks[0]?.type || 'video/webm';
  const blob = new Blob(source.chunks, { type: mimeType });
  const filename = buildSidecarFilename(source.filenameSuffix);
  await saveRecordingSafely(source.recordingId, blob, filename);
  await triggerMultiSourceDownload(source.recordingId, filename);
  return { blob, filename, mimeType, source, duration };
}

export function createWebcamProjectInput(
  result: SavedWebcamRecording | null
): WebcamProjectInput | null {
  return result
    ? {
        recordingId: result.source.recordingId,
        filename: result.filename,
        width: result.source.trackSettings.width ?? 1280,
        height: result.source.trackSettings.height ?? 720,
        duration: result.duration,
        mimeType: result.mimeType,
        size: result.blob.size,
      }
    : null;
}
