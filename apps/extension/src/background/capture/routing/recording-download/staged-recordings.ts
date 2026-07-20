import type { ContentSenderBinding } from '../authorization/content-action';
import { decodeBase64Bytes } from '@sniptale/runtime-contracts/validation/base64';
import {
  MAX_ACTIVE_STAGED_RECORDING_BYTES,
  MAX_ACTIVE_STAGED_RECORDINGS,
  STAGED_RECORDING_TTL_MS,
  assertStagedRecordingChunkBase64,
  assertStagedRecordingIds,
  assertStagedRecordingMetadata,
  isSameRecordingOwner,
} from './staged-recording-validation';

type StagedRecordingRecord = {
  chunks: Array<Uint8Array<ArrayBuffer> | undefined>;
  createdAt: number;
  owner: ContentSenderBinding;
  receivedBytes: number;
  recordingSessionId: string;
  totalBytes: number;
  totalChunks: number;
};

const stagedRecordings = new Map<string, StagedRecordingRecord>();

function purgeExpiredStagedRecordings(now = Date.now()): void {
  for (const [id, record] of stagedRecordings) {
    if (now - record.createdAt > STAGED_RECORDING_TTL_MS) {
      stagedRecordings.delete(id);
    }
  }
}

function getReservedStagedRecordingBytes(): number {
  let bytes = 0;
  for (const record of stagedRecordings.values()) {
    bytes += record.totalBytes;
  }
  return bytes;
}

function assertCanCreateStagedRecording(totalBytes: number): void {
  if (stagedRecordings.size >= MAX_ACTIVE_STAGED_RECORDINGS) {
    throw new Error('Too many recording staged payloads');
  }

  if (getReservedStagedRecordingBytes() + totalBytes > MAX_ACTIVE_STAGED_RECORDING_BYTES) {
    throw new Error('Recording staged payload aggregate limit exceeded');
  }
}

function createStagedRecordingRecord(args: {
  owner: ContentSenderBinding;
  recordingSessionId: string;
  totalBytes: number;
  totalChunks: number;
}): StagedRecordingRecord {
  return {
    chunks: Array.from({ length: args.totalChunks }),
    createdAt: Date.now(),
    owner: args.owner,
    receivedBytes: 0,
    recordingSessionId: args.recordingSessionId,
    totalBytes: args.totalBytes,
    totalChunks: args.totalChunks,
  };
}

function assertRecordMatchesChunk(args: {
  owner: ContentSenderBinding;
  record: StagedRecordingRecord;
  recordingSessionId: string;
  totalBytes: number;
  totalChunks: number;
}): void {
  if (
    !isSameRecordingOwner(args.record.owner, args.owner) ||
    args.record.recordingSessionId !== args.recordingSessionId ||
    args.record.totalBytes !== args.totalBytes ||
    args.record.totalChunks !== args.totalChunks
  ) {
    throw new Error('Recording staged payload metadata changed');
  }
}

function writeStagedRecordingChunk(args: {
  chunkBytes: Uint8Array<ArrayBuffer>;
  chunkIndex: number;
  record: StagedRecordingRecord;
  stagedRecordingId: string;
}): void {
  if (args.record.chunks[args.chunkIndex]) {
    throw new Error('Recording staged payload chunk was already received');
  }

  args.record.chunks[args.chunkIndex] = args.chunkBytes;
  args.record.receivedBytes += args.chunkBytes.byteLength;
  if (args.record.receivedBytes > args.record.totalBytes) {
    stagedRecordings.delete(args.stagedRecordingId);
    throw new Error('Recording staged payload is too large');
  }
}

type StageRecordingDownloadChunkArgs = {
  base64: string;
  chunkIndex: number;
  owner: ContentSenderBinding;
  recordingSessionId: string;
  stagedRecordingId: string;
  totalBytes: number;
  totalChunks: number;
};

function resolveStagedRecordingRecord(args: StageRecordingDownloadChunkArgs): {
  existing: boolean;
  record: StagedRecordingRecord;
} {
  const existingRecord = stagedRecordings.get(args.stagedRecordingId);
  if (!existingRecord) {
    assertCanCreateStagedRecording(args.totalBytes);
  }

  return {
    existing: existingRecord !== undefined,
    record:
      existingRecord ??
      createStagedRecordingRecord({
        recordingSessionId: args.recordingSessionId,
        owner: args.owner,
        totalBytes: args.totalBytes,
        totalChunks: args.totalChunks,
      }),
  };
}

export function stageRecordingDownloadChunk(args: StageRecordingDownloadChunkArgs): {
  complete: boolean;
  stagedRecordingId: string;
} {
  purgeExpiredStagedRecordings();
  assertStagedRecordingMetadata(args);
  assertStagedRecordingChunkBase64(args);

  const { existing, record } = resolveStagedRecordingRecord(args);

  try {
    assertRecordMatchesChunk({ ...args, record });
    writeStagedRecordingChunk({
      chunkBytes: decodeBase64Bytes(args.base64),
      chunkIndex: args.chunkIndex,
      record,
      stagedRecordingId: args.stagedRecordingId,
    });
  } catch (error) {
    if (existing) {
      stagedRecordings.delete(args.stagedRecordingId);
    }
    throw error;
  }

  stagedRecordings.set(args.stagedRecordingId, record);

  return {
    complete: record.chunks.every(Boolean) && record.receivedBytes === record.totalBytes,
    stagedRecordingId: args.stagedRecordingId,
  };
}

export function consumeRecordingDownload(args: {
  mimeType: string;
  owner: ContentSenderBinding;
  recordingSessionId: string;
  stagedRecordingId: string;
}): Blob {
  assertStagedRecordingIds(args);

  purgeExpiredStagedRecordings();
  const record = stagedRecordings.get(args.stagedRecordingId);

  if (
    !record ||
    record.recordingSessionId !== args.recordingSessionId ||
    !isSameRecordingOwner(record.owner, args.owner)
  ) {
    throw new Error('Recording staged payload is missing or incomplete');
  }

  stagedRecordings.delete(args.stagedRecordingId);

  if (record.chunks.some((chunk) => !chunk) || record.receivedBytes !== record.totalBytes) {
    throw new Error('Recording staged payload is missing or incomplete');
  }

  return new Blob(record.chunks as Uint8Array<ArrayBuffer>[], { type: args.mimeType });
}

export function releaseRecordingDownload(args: {
  owner: ContentSenderBinding;
  recordingSessionId: string;
  stagedRecordingId: string;
}): void {
  assertStagedRecordingIds(args);

  purgeExpiredStagedRecordings();
  const record = stagedRecordings.get(args.stagedRecordingId);
  if (
    record &&
    (record.recordingSessionId !== args.recordingSessionId ||
      !isSameRecordingOwner(record.owner, args.owner))
  ) {
    throw new Error('Recording staged payload metadata changed');
  }
  stagedRecordings.delete(args.stagedRecordingId);
}

export function resetRecordingDownloadStagingForTests(): void {
  stagedRecordings.clear();
}
