import type { WebSnapshotStagedBlobKind } from '@sniptale/runtime-contracts/web-snapshot';

const MAX_PACKAGE_BYTES = 100 * 1024 * 1024;
const MAX_SCREENSHOT_BYTES = 25 * 1024 * 1024;
const MAX_STAGED_BLOB_RECORDS = 32;
const MAX_TOTAL_STAGED_BYTES = MAX_PACKAGE_BYTES + MAX_SCREENSHOT_BYTES;

export const MAX_CHUNK_BYTES = 512 * 1024;
export const MAX_CHUNKS = 256;
export const STAGED_BLOB_TTL_MS = 5 * 60 * 1000;

export function getMaxStagedBlobBytes(kind: WebSnapshotStagedBlobKind): number {
  return kind === 'package' ? MAX_PACKAGE_BYTES : MAX_SCREENSHOT_BYTES;
}

function getReservedStagedBytes(records: Iterable<Readonly<{ totalBytes: number }>>): number {
  let reservedBytes = 0;
  for (const record of records) {
    reservedBytes += record.totalBytes;
  }
  return reservedBytes;
}

export function assertStagedBlobCapacity(args: {
  recordCount: number;
  records: Iterable<Readonly<{ totalBytes: number }>>;
  totalBytes: number;
}): void {
  if (args.recordCount >= MAX_STAGED_BLOB_RECORDS) {
    throw new Error('Too many web snapshot staged payloads');
  }

  if (getReservedStagedBytes(args.records) + args.totalBytes > MAX_TOTAL_STAGED_BYTES) {
    throw new Error('Web snapshot staged payload aggregate limit exceeded');
  }
}
