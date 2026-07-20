import { getRecording } from '../../composition/persistence/recordings/index';
import { createLogger } from '@sniptale/platform/observability/logger';
import { saveRecordingSafely } from '../../workflows/media-hub/store';
import { loadSettings } from '../../composition/persistence/settings';
import {
  MAX_RECORDING_SIDECAR_TEXT_BYTES,
  estimateUtf8Bytes,
  isSafeDownloadFilename,
  isSafeDownloadMimeType,
} from '@sniptale/runtime-contracts/validation/base64';
import { executeDownloadBlob } from '../routing-contracts/download-port';

const logger = createLogger({ namespace: 'BackgroundRecordingDownload' });
const MAX_SIDECAR_PAYLOAD_BYTES = MAX_RECORDING_SIDECAR_TEXT_BYTES;

function createRecordingId(): string {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `recording-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function assertTextSize(value: string, maxBytes: number, label: string): void {
  if (estimateUtf8Bytes(value) > maxBytes) {
    throw new Error(`${label} is too large`);
  }
}

function assertRecordingBlobPayload(payload: {
  blob: Blob;
  filename: string;
  mimeType: string;
}): void {
  if (
    !(payload.blob instanceof Blob) ||
    payload.blob.size <= 0 ||
    !isSafeDownloadFilename(payload.filename) ||
    !isSafeDownloadMimeType(payload.mimeType)
  ) {
    throw new Error('Invalid recording payload');
  }
}

async function resolveDefaultVideoPresetId(): Promise<string | null> {
  const settings = await loadSettings();
  return settings.defaultVideoPresetId ?? null;
}

export async function downloadStoredRecording(
  recordingId: string,
  filename: string
): Promise<number | undefined> {
  const recordingEntry = await getRecording(recordingId);
  if (!recordingEntry) {
    throw new Error(`Recording ${recordingId} is not available for download`);
  }

  const downloadId = await executeDownloadBlob(
    recordingEntry.blob,
    filename,
    await resolveDefaultVideoPresetId()
  );
  logger.log('Downloaded stored recording', { filename, recordingId });
  return downloadId;
}

export async function saveRecordingBlobForDownload(payload: {
  blob: Blob;
  filename: string;
  mimeType: string;
}): Promise<{ downloadId: number | undefined; recordingId: string }> {
  assertRecordingBlobPayload(payload);
  const recordingId = createRecordingId();
  const blob =
    payload.blob.type === payload.mimeType
      ? payload.blob
      : payload.blob.slice(0, payload.blob.size, payload.mimeType);
  await saveRecordingSafely(recordingId, blob, payload.filename);
  const downloadId = await downloadStoredRecording(recordingId, payload.filename);
  return { downloadId, recordingId };
}

export async function downloadRecordingSidecar(payload: {
  content: string;
  filename: string;
  mimeType: string;
}): Promise<number | undefined> {
  if (
    typeof payload.content !== 'string' ||
    payload.content.length === 0 ||
    !isSafeDownloadFilename(payload.filename) ||
    !isSafeDownloadMimeType(payload.mimeType)
  ) {
    throw new Error('Invalid recording sidecar payload');
  }
  assertTextSize(payload.content, MAX_SIDECAR_PAYLOAD_BYTES, 'Recording sidecar payload');
  const blob = new Blob([payload.content], { type: payload.mimeType });
  const downloadId = await executeDownloadBlob(
    blob,
    payload.filename,
    await resolveDefaultVideoPresetId()
  );
  logger.log('Downloaded recording sidecar', { filename: payload.filename });
  return downloadId;
}
