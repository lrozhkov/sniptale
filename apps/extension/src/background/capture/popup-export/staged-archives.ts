import { decodeBase64Bytes } from '@sniptale/runtime-contracts/validation/base64';
import {
  assertPopupExportArchiveChunkBase64,
  assertPopupExportArchiveChunkMetadata,
  isValidPopupExportArchiveId,
  POPUP_EXPORT_ARCHIVE_MAX_ACTIVE_ARCHIVES,
  POPUP_EXPORT_ARCHIVE_MAX_ACTIVE_BYTES,
} from './staged-archive-validation';

const STAGED_ARCHIVE_TTL_MS = 5 * 60 * 1000;

type StagedArchiveRecord = {
  archiveSessionId: string;
  chunks: Array<Uint8Array<ArrayBuffer> | undefined>;
  createdAt: number;
  receivedBytes: number;
  totalBytes: number;
  totalChunks: number;
};

const stagedArchives = new Map<string, StagedArchiveRecord>();

function purgeExpiredStagedArchives(now = Date.now()): void {
  for (const [id, record] of stagedArchives) {
    if (now - record.createdAt > STAGED_ARCHIVE_TTL_MS) {
      stagedArchives.delete(id);
    }
  }
}

function getReservedStagedArchiveBytes(): number {
  let bytes = 0;
  for (const record of stagedArchives.values()) {
    bytes += record.totalBytes;
  }
  return bytes;
}

function createStagedArchiveRecord(args: {
  archiveSessionId: string;
  totalBytes: number;
  totalChunks: number;
}): StagedArchiveRecord {
  return {
    archiveSessionId: args.archiveSessionId,
    chunks: Array.from({ length: args.totalChunks }),
    createdAt: Date.now(),
    receivedBytes: 0,
    totalBytes: args.totalBytes,
    totalChunks: args.totalChunks,
  };
}

function assertRecordMatchesChunk(args: {
  archiveSessionId: string;
  record: StagedArchiveRecord;
  totalBytes: number;
  totalChunks: number;
}): void {
  if (
    args.record.archiveSessionId !== args.archiveSessionId ||
    args.record.totalBytes !== args.totalBytes ||
    args.record.totalChunks !== args.totalChunks
  ) {
    throw new Error('Popup export staged archive metadata changed');
  }
}

function writeStagedChunk(args: {
  chunkBytes: Uint8Array<ArrayBuffer>;
  chunkIndex: number;
  record: StagedArchiveRecord;
  stagedArchiveId: string;
}): void {
  if (args.record.chunks[args.chunkIndex]) {
    throw new Error('Popup export staged archive chunk was already received');
  }

  args.record.chunks[args.chunkIndex] = args.chunkBytes;
  args.record.receivedBytes += args.chunkBytes.byteLength;
  if (args.record.receivedBytes > args.record.totalBytes) {
    stagedArchives.delete(args.stagedArchiveId);
    throw new Error('Popup export staged archive is too large');
  }
}

function assertCanCreateStagedArchive(totalBytes: number): void {
  if (stagedArchives.size >= POPUP_EXPORT_ARCHIVE_MAX_ACTIVE_ARCHIVES) {
    throw new Error('Too many popup export staged archives');
  }

  if (getReservedStagedArchiveBytes() + totalBytes > POPUP_EXPORT_ARCHIVE_MAX_ACTIVE_BYTES) {
    throw new Error('Too many popup export staged archive bytes');
  }
}

function resolveStagedArchiveRecord(args: {
  archiveSessionId: string;
  stagedArchiveId: string;
  totalBytes: number;
  totalChunks: number;
}): { existing: boolean; record: StagedArchiveRecord } {
  const existingRecord = stagedArchives.get(args.stagedArchiveId);
  if (!existingRecord) {
    assertCanCreateStagedArchive(args.totalBytes);
  }

  return {
    existing: existingRecord !== undefined,
    record:
      existingRecord ??
      createStagedArchiveRecord({
        archiveSessionId: args.archiveSessionId,
        totalBytes: args.totalBytes,
        totalChunks: args.totalChunks,
      }),
  };
}

function writeValidatedStagedChunk(args: {
  archiveSessionId: string;
  base64: string;
  chunkIndex: number;
  existing: boolean;
  record: StagedArchiveRecord;
  stagedArchiveId: string;
  totalBytes: number;
  totalChunks: number;
}): void {
  try {
    assertRecordMatchesChunk(args);
    writeStagedChunk({
      chunkBytes: decodeBase64Bytes(args.base64),
      chunkIndex: args.chunkIndex,
      record: args.record,
      stagedArchiveId: args.stagedArchiveId,
    });
  } catch (error) {
    if (args.existing) {
      stagedArchives.delete(args.stagedArchiveId);
    }
    throw error;
  }
}

function isStagedArchiveComplete(record: StagedArchiveRecord): boolean {
  return record.chunks.every(Boolean) && record.receivedBytes === record.totalBytes;
}

export function stagePopupExportArchiveChunk(args: {
  archiveSessionId: string;
  base64: string;
  chunkIndex: number;
  stagedArchiveId: string;
  totalBytes: number;
  totalChunks: number;
}): { complete: boolean; stagedArchiveId: string } {
  purgeExpiredStagedArchives();
  assertPopupExportArchiveChunkMetadata(args);
  assertPopupExportArchiveChunkBase64(args);

  const { existing, record } = resolveStagedArchiveRecord(args);
  writeValidatedStagedChunk({ ...args, existing, record });
  stagedArchives.set(args.stagedArchiveId, record);

  return {
    complete: isStagedArchiveComplete(record),
    stagedArchiveId: args.stagedArchiveId,
  };
}

export function releasePopupExportStagedArchive(args: {
  archiveSessionId: string;
  stagedArchiveId: string;
}): void {
  if (
    !isValidPopupExportArchiveId(args.archiveSessionId) ||
    !isValidPopupExportArchiveId(args.stagedArchiveId)
  ) {
    throw new Error('Popup export staged archive metadata is invalid');
  }

  purgeExpiredStagedArchives();
  const record = stagedArchives.get(args.stagedArchiveId);
  if (record && record.archiveSessionId !== args.archiveSessionId) {
    throw new Error('Popup export staged archive metadata changed');
  }
  stagedArchives.delete(args.stagedArchiveId);
}

export function consumePopupExportStagedArchive(args: {
  archiveSessionId: string;
  mimeType: string;
  stagedArchiveId: string;
}): Blob {
  if (
    !isValidPopupExportArchiveId(args.archiveSessionId) ||
    !isValidPopupExportArchiveId(args.stagedArchiveId)
  ) {
    throw new Error('Popup export staged archive metadata is invalid');
  }

  purgeExpiredStagedArchives();
  const record = stagedArchives.get(args.stagedArchiveId);
  stagedArchives.delete(args.stagedArchiveId);

  if (
    !record ||
    record.archiveSessionId !== args.archiveSessionId ||
    record.chunks.some((chunk) => !chunk) ||
    record.receivedBytes !== record.totalBytes
  ) {
    throw new Error('Popup export staged archive is missing or incomplete');
  }

  return new Blob(record.chunks as Uint8Array<ArrayBuffer>[], { type: args.mimeType });
}

export function resetPopupExportStagedArchivesForTests(): void {
  stagedArchives.clear();
}
