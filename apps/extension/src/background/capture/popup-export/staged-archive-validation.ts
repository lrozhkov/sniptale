import {
  estimateBase64DecodedBytes,
  isCanonicalBase64,
  MAX_SAVE_BLOB_BASE64_DECODED_BYTES,
} from '@sniptale/runtime-contracts/validation/base64';

export const POPUP_EXPORT_ARCHIVE_MAX_ACTIVE_ARCHIVES = 4;
export const POPUP_EXPORT_ARCHIVE_MAX_ACTIVE_BYTES = MAX_SAVE_BLOB_BASE64_DECODED_BYTES;

const POPUP_EXPORT_ARCHIVE_MAX_CHUNK_BYTES = 512 * 1024;
const POPUP_EXPORT_ARCHIVE_MAX_CHUNKS = 256;
const MAX_ARCHIVE_ID_LENGTH = 128;
const ARCHIVE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function isValidPopupExportArchiveId(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_ARCHIVE_ID_LENGTH &&
    ARCHIVE_ID_PATTERN.test(value)
  );
}

export function assertPopupExportArchiveChunkMetadata(args: {
  archiveSessionId: string;
  chunkIndex: number;
  stagedArchiveId: string;
  totalBytes: number;
  totalChunks: number;
}): void {
  if (
    !isValidPopupExportArchiveId(args.archiveSessionId) ||
    !isValidPopupExportArchiveId(args.stagedArchiveId) ||
    !Number.isInteger(args.chunkIndex) ||
    !Number.isInteger(args.totalChunks) ||
    !Number.isInteger(args.totalBytes) ||
    args.chunkIndex < 0 ||
    args.totalChunks < 1 ||
    args.totalChunks > POPUP_EXPORT_ARCHIVE_MAX_CHUNKS ||
    args.chunkIndex >= args.totalChunks ||
    args.totalBytes <= 0 ||
    args.totalBytes > MAX_SAVE_BLOB_BASE64_DECODED_BYTES
  ) {
    throw new Error('Popup export staged archive metadata is invalid');
  }
}

export function assertPopupExportArchiveChunkBase64(args: {
  base64: string;
  totalBytes: number;
}): void {
  if (!isCanonicalBase64(args.base64)) {
    throw new Error('Popup export staged archive chunk is invalid');
  }

  const decodedBytes = estimateBase64DecodedBytes(args.base64);
  if (decodedBytes > POPUP_EXPORT_ARCHIVE_MAX_CHUNK_BYTES || decodedBytes > args.totalBytes) {
    throw new Error('Popup export staged archive chunk is too large');
  }
}
