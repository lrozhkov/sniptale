import type { WebSnapshotStagedBlobKind } from '@sniptale/runtime-contracts/web-snapshot';
import {
  decodeBase64Bytes,
  estimateBase64DecodedBytes,
  isCanonicalBase64,
} from '@sniptale/runtime-contracts/validation/base64';
import {
  MAX_CHUNK_BYTES,
  MAX_CHUNKS,
  STAGED_BLOB_TTL_MS,
  assertStagedBlobCapacity,
  getMaxStagedBlobBytes,
} from './staged-blob-limits';

type StagedBlobRecord = {
  chunks: Array<Uint8Array<ArrayBuffer> | undefined>;
  createdAt: number;
  kind: WebSnapshotStagedBlobKind;
  receivedBytes: number;
  snapshotSessionId: string;
  tabId: number;
  totalBytes: number;
  totalChunks: number;
};

const stagedBlobs = new Map<string, StagedBlobRecord>();

function purgeExpiredStagedBlobs(now = Date.now()): void {
  for (const [id, record] of stagedBlobs) {
    if (now - record.createdAt > STAGED_BLOB_TTL_MS) {
      stagedBlobs.delete(id);
    }
  }
}

function assertChunkMetadata(args: {
  chunkIndex: number;
  kind: WebSnapshotStagedBlobKind;
  totalBytes: number;
  totalChunks: number;
}): void {
  if (
    !Number.isInteger(args.chunkIndex) ||
    !Number.isInteger(args.totalChunks) ||
    !Number.isInteger(args.totalBytes) ||
    args.chunkIndex < 0 ||
    args.totalChunks < 1 ||
    args.totalChunks > MAX_CHUNKS ||
    args.chunkIndex >= args.totalChunks ||
    args.totalBytes < 0 ||
    args.totalBytes > getMaxStagedBlobBytes(args.kind)
  ) {
    throw new Error('Web snapshot staged payload metadata is invalid');
  }
}

function createStagedBlobRecord(args: {
  kind: WebSnapshotStagedBlobKind;
  snapshotSessionId: string;
  tabId: number;
  totalBytes: number;
  totalChunks: number;
}): StagedBlobRecord {
  return {
    chunks: Array.from({ length: args.totalChunks }),
    createdAt: Date.now(),
    kind: args.kind,
    receivedBytes: 0,
    snapshotSessionId: args.snapshotSessionId,
    tabId: args.tabId,
    totalBytes: args.totalBytes,
    totalChunks: args.totalChunks,
  };
}

function assertRecordMatchesChunk(args: {
  kind: WebSnapshotStagedBlobKind;
  record: StagedBlobRecord;
  snapshotSessionId: string;
  tabId: number;
  totalBytes: number;
  totalChunks: number;
}): void {
  if (
    args.record.kind !== args.kind ||
    args.record.snapshotSessionId !== args.snapshotSessionId ||
    args.record.tabId !== args.tabId ||
    args.record.totalBytes !== args.totalBytes ||
    args.record.totalChunks !== args.totalChunks
  ) {
    throw new Error('Web snapshot staged payload metadata changed');
  }
}

function writeStagedChunk(args: {
  chunkBytes: Uint8Array<ArrayBuffer>;
  chunkIndex: number;
  record: StagedBlobRecord;
  stagedBlobId: string;
}): void {
  if (args.record.chunks[args.chunkIndex]) {
    throw new Error('Web snapshot staged payload chunk was already received');
  }

  args.record.chunks[args.chunkIndex] = args.chunkBytes;
  args.record.receivedBytes += args.chunkBytes.byteLength;
  if (args.record.receivedBytes > args.record.totalBytes) {
    stagedBlobs.delete(args.stagedBlobId);
    throw new Error('Web snapshot staged payload is too large');
  }
}

type StageWebSnapshotBlobChunkArgs = {
  base64: string;
  chunkIndex: number;
  kind: WebSnapshotStagedBlobKind;
  snapshotSessionId: string;
  stagedBlobId: string;
  tabId: number;
  totalBytes: number;
  totalChunks: number;
};

function getOrCreateStagedBlobRecord(args: StageWebSnapshotBlobChunkArgs): StagedBlobRecord {
  const existingRecord = stagedBlobs.get(args.stagedBlobId);
  if (existingRecord) {
    return existingRecord;
  }

  assertStagedBlobCapacity({
    recordCount: stagedBlobs.size,
    records: stagedBlobs.values(),
    totalBytes: args.totalBytes,
  });
  return createStagedBlobRecord(args);
}

export function stageWebSnapshotBlobChunk(args: StageWebSnapshotBlobChunkArgs): {
  complete: boolean;
  stagedBlobId: string;
} {
  purgeExpiredStagedBlobs();
  assertChunkMetadata(args);

  if (!isCanonicalBase64(args.base64)) {
    throw new Error('Web snapshot staged payload chunk is invalid');
  }

  const decodedBytes = estimateBase64DecodedBytes(args.base64);
  if (decodedBytes > MAX_CHUNK_BYTES || decodedBytes > args.totalBytes) {
    throw new Error('Web snapshot staged payload chunk is too large');
  }

  const record = getOrCreateStagedBlobRecord(args);
  assertRecordMatchesChunk({ ...args, record });

  const chunkBytes = decodeBase64Bytes(args.base64);
  writeStagedChunk({
    chunkBytes,
    chunkIndex: args.chunkIndex,
    record,
    stagedBlobId: args.stagedBlobId,
  });
  stagedBlobs.set(args.stagedBlobId, record);

  return {
    complete: record.chunks.every(Boolean) && record.receivedBytes === record.totalBytes,
    stagedBlobId: args.stagedBlobId,
  };
}

export function consumeWebSnapshotStagedBlob(args: {
  expectedKind: WebSnapshotStagedBlobKind;
  snapshotSessionId: string;
  stagedBlobId: string;
  tabId: number;
  type: string;
}): Blob {
  purgeExpiredStagedBlobs();
  const record = stagedBlobs.get(args.stagedBlobId);

  if (!record) {
    throw new Error('Web snapshot staged payload is missing or incomplete');
  }

  if (
    record.kind !== args.expectedKind ||
    record.snapshotSessionId !== args.snapshotSessionId ||
    record.tabId !== args.tabId
  ) {
    throw new Error('Web snapshot staged payload is missing or incomplete');
  }

  stagedBlobs.delete(args.stagedBlobId);

  if (record.chunks.some((chunk) => !chunk) || record.receivedBytes !== record.totalBytes) {
    throw new Error('Web snapshot staged payload is missing or incomplete');
  }

  return new Blob(record.chunks as Uint8Array<ArrayBuffer>[], { type: args.type });
}

export function releaseWebSnapshotStagedBlobs(args: {
  packageStagedBlobId?: string;
  screenshotStagedBlobId?: string;
  snapshotSessionId: string;
  tabId: number;
}): void {
  if (args.packageStagedBlobId) {
    releaseOwnedStagedBlob(args.packageStagedBlobId, args);
  }
  if (args.screenshotStagedBlobId) {
    releaseOwnedStagedBlob(args.screenshotStagedBlobId, args);
  }
}

function releaseOwnedStagedBlob(
  stagedBlobId: string,
  owner: { snapshotSessionId: string; tabId: number }
): void {
  const record = stagedBlobs.get(stagedBlobId);
  if (
    record &&
    record.snapshotSessionId === owner.snapshotSessionId &&
    record.tabId === owner.tabId
  ) {
    stagedBlobs.delete(stagedBlobId);
  }
}

export function resetWebSnapshotStagedBlobsForTests(): void {
  stagedBlobs.clear();
}
