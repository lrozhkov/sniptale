import {
  MAX_RECORDING_BASE64_DECODED_BYTES,
  estimateBase64DecodedBytes,
  isCanonicalBase64,
} from '@sniptale/runtime-contracts/validation/base64';
import {
  MAX_RECORDING_DOWNLOAD_STAGE_CHUNK_BYTES,
  MAX_RECORDING_DOWNLOAD_STAGE_CHUNKS,
  isRecordingDownloadStageId,
} from '@sniptale/runtime-contracts/messaging/recording-download';
import type { ContentSenderBinding } from '../authorization/content-action';

export const MAX_ACTIVE_STAGED_RECORDINGS = 4;
export const MAX_ACTIVE_STAGED_RECORDING_BYTES = MAX_RECORDING_BASE64_DECODED_BYTES;
export const STAGED_RECORDING_TTL_MS = 5 * 60 * 1000;

export function assertStagedRecordingMetadata(args: {
  chunkIndex: number;
  recordingSessionId: string;
  stagedRecordingId: string;
  totalBytes: number;
  totalChunks: number;
}): void {
  if (
    !isRecordingDownloadStageId(args.recordingSessionId) ||
    !isRecordingDownloadStageId(args.stagedRecordingId) ||
    !Number.isInteger(args.chunkIndex) ||
    !Number.isInteger(args.totalChunks) ||
    !Number.isInteger(args.totalBytes) ||
    args.chunkIndex < 0 ||
    args.totalChunks < 1 ||
    args.totalChunks > MAX_RECORDING_DOWNLOAD_STAGE_CHUNKS ||
    args.chunkIndex >= args.totalChunks ||
    args.totalBytes <= 0 ||
    args.totalBytes > MAX_RECORDING_BASE64_DECODED_BYTES
  ) {
    throw new Error('Recording staged payload metadata is invalid');
  }
}

export function assertStagedRecordingIds(args: {
  recordingSessionId: string;
  stagedRecordingId: string;
}): void {
  if (
    !isRecordingDownloadStageId(args.recordingSessionId) ||
    !isRecordingDownloadStageId(args.stagedRecordingId)
  ) {
    throw new Error('Recording staged payload metadata is invalid');
  }
}

export function assertStagedRecordingChunkBase64(args: {
  base64: string;
  totalBytes: number;
}): void {
  if (!isCanonicalBase64(args.base64)) {
    throw new Error('Recording staged payload chunk is invalid');
  }

  const decodedBytes = estimateBase64DecodedBytes(args.base64);
  if (decodedBytes > MAX_RECORDING_DOWNLOAD_STAGE_CHUNK_BYTES || decodedBytes > args.totalBytes) {
    throw new Error('Recording staged payload chunk is too large');
  }
}

export function isSameRecordingOwner(
  left: ContentSenderBinding,
  right: ContentSenderBinding
): boolean {
  return (
    left.documentId === right.documentId &&
    left.frameId === right.frameId &&
    left.senderUrl === right.senderUrl &&
    left.tabId === right.tabId
  );
}
