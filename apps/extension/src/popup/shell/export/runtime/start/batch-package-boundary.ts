import type { ExportPagePackage, ExportPagePackageEntry } from '@sniptale/runtime-contracts/export';
import { isSafeArchiveEntryLeafFilename } from '@sniptale/platform/data/zip-profile/entry-filenames';
import {
  estimateBase64DecodedBytes,
  estimateUtf8Bytes,
  isCanonicalBase64,
} from '@sniptale/runtime-contracts/validation/base64';
import { hasAsciiControlCharacter } from '@sniptale/platform/security/sanitizers/text';

const MAX_BATCH_PACKAGE_ENTRIES = 2_000;
export const MAX_BATCH_AGGREGATE_DECODED_BYTES = 250 * 1024 * 1024;
const MAX_BATCH_PACKAGE_TOTAL_BYTES = MAX_BATCH_AGGREGATE_DECODED_BYTES;
const MAX_BATCH_PACKAGE_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_BATCH_AGGREGATE_ENTRIES = 10_000;
const MAX_BATCH_AGGREGATE_DIRECTORY_NODES = 20_000;
export const MAX_BATCH_ENTRY_PATH_DEPTH = 16;
const MAX_BATCH_ARCHIVE_BASE_NAME_LENGTH = 160;
const MAX_BATCH_ENTRY_PATH_LENGTH = 240;
const POSIX_PATH_SEPARATOR = '/';

export type PopupBatchResourceUsage = {
  decodedBytes: number;
  directoryNodes: number;
  entries: number;
};

function isUnsafePathSegment(segment: string): boolean {
  return segment === '' || segment === '.' || segment === '..';
}

function parseSafeBatchArchiveBaseName(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed !== value ||
    trimmed.length > MAX_BATCH_ARCHIVE_BASE_NAME_LENGTH ||
    !isSafeArchiveEntryLeafFilename(trimmed)
  ) {
    throw new Error('Unsafe popup export package archive base name');
  }

  return trimmed;
}

function parseSafeBatchEntryPath(value: string): string {
  const trimmed = value.trim();
  const segments = trimmed.split(POSIX_PATH_SEPARATOR);
  if (
    trimmed.length === 0 ||
    trimmed !== value ||
    trimmed.length > MAX_BATCH_ENTRY_PATH_LENGTH ||
    trimmed.startsWith(POSIX_PATH_SEPARATOR) ||
    /^[A-Za-z]:/u.test(trimmed) ||
    trimmed.includes('\\') ||
    hasAsciiControlCharacter(trimmed) ||
    segments.length > MAX_BATCH_ENTRY_PATH_DEPTH ||
    segments.some(
      (segment) => isUnsafePathSegment(segment) || !isSafeArchiveEntryLeafFilename(segment)
    )
  ) {
    throw new Error('Unsafe popup export package entry path');
  }

  return segments.join(POSIX_PATH_SEPARATOR);
}

function assertEntryBytes(bytes: number): void {
  if (bytes > MAX_BATCH_PACKAGE_ENTRY_BYTES) {
    throw new Error(`Popup export package entry exceeds ${MAX_BATCH_PACKAGE_ENTRY_BYTES} bytes`);
  }
}

function getBatchEntryDecodedBytes(entry: ExportPagePackageEntry): number {
  return typeof entry.textContent === 'string'
    ? estimateUtf8Bytes(entry.textContent, MAX_BATCH_PACKAGE_ENTRY_BYTES)
    : estimateBase64DecodedBytes(entry.binaryBase64 ?? '');
}

function parseBatchPackageEntry(entry: ExportPagePackageEntry): {
  decodedBytes: number;
  entry: ExportPagePackageEntry;
} {
  const path = parseSafeBatchEntryPath(entry.path);
  const hasTextContent = typeof entry.textContent === 'string';
  const hasBinaryContent = typeof entry.binaryBase64 === 'string';
  if (hasTextContent === hasBinaryContent) {
    throw new Error('Popup export package entry must have exactly one content representation');
  }

  const normalizedMetadata = {
    path,
    ...(typeof entry.mimeType === 'string' ? { mimeType: entry.mimeType } : {}),
  };
  if (typeof entry.textContent === 'string') {
    const textContent = entry.textContent;
    const decodedBytes = estimateUtf8Bytes(textContent, MAX_BATCH_PACKAGE_ENTRY_BYTES);
    assertEntryBytes(decodedBytes);
    return { decodedBytes, entry: { ...normalizedMetadata, textContent } };
  }

  if (typeof entry.binaryBase64 === 'string') {
    const binaryBase64 = entry.binaryBase64;
    if (!isCanonicalBase64(binaryBase64)) {
      throw new Error('Invalid popup export package base64 entry');
    }
    const decodedBytes = estimateBase64DecodedBytes(binaryBase64);
    assertEntryBytes(decodedBytes);
    return { decodedBytes, entry: { ...normalizedMetadata, binaryBase64 } };
  }

  throw new Error('Popup export package entry must have exactly one content representation');
}

function addEntryDirectoryNodes(path: string, directoryNodes: Set<string>): void {
  const directorySegments = path.split(POSIX_PATH_SEPARATOR).slice(0, -1);
  let directoryPath = '';
  for (const segment of directorySegments) {
    directoryPath = directoryPath ? `${directoryPath}${POSIX_PATH_SEPARATOR}${segment}` : segment;
    directoryNodes.add(directoryPath);
  }
}

export function addPopupBatchResourceUsage(
  current: PopupBatchResourceUsage,
  next: PopupBatchResourceUsage
): PopupBatchResourceUsage {
  return {
    decodedBytes: current.decodedBytes + next.decodedBytes,
    directoryNodes: current.directoryNodes + next.directoryNodes,
    entries: current.entries + next.entries,
  };
}

export function assertPopupBatchAggregateResourceUsage(usage: PopupBatchResourceUsage): void {
  if (usage.entries > MAX_BATCH_AGGREGATE_ENTRIES) {
    throw new Error(`Popup batch export aggregate exceeds ${MAX_BATCH_AGGREGATE_ENTRIES} entries`);
  }
  if (usage.directoryNodes > MAX_BATCH_AGGREGATE_DIRECTORY_NODES) {
    throw new Error(
      `Popup batch export aggregate exceeds ${MAX_BATCH_AGGREGATE_DIRECTORY_NODES} directory nodes`
    );
  }
  if (usage.decodedBytes > MAX_BATCH_AGGREGATE_DECODED_BYTES) {
    throw new Error(
      `Popup batch export aggregate exceeds ${MAX_BATCH_AGGREGATE_DECODED_BYTES} decoded bytes`
    );
  }
}

export function parsePopupBatchPagePackageAtBoundary(
  pagePackage: ExportPagePackage
): ExportPagePackage {
  if (pagePackage.entries.length > MAX_BATCH_PACKAGE_ENTRIES) {
    throw new Error(`Popup export package exceeds ${MAX_BATCH_PACKAGE_ENTRIES} entries`);
  }

  let totalBytes = 0;
  const directoryNodes = new Set<string>();
  const seenPaths = new Set<string>();
  const entries = pagePackage.entries.map((entry) => {
    const parsed = parseBatchPackageEntry(entry);
    const parsedEntry = parsed.entry;
    if (seenPaths.has(parsedEntry.path)) {
      throw new Error('Duplicate popup export package entry path');
    }
    seenPaths.add(parsedEntry.path);
    addEntryDirectoryNodes(parsedEntry.path, directoryNodes);
    if (directoryNodes.size > MAX_BATCH_AGGREGATE_DIRECTORY_NODES) {
      throw new Error(
        `Popup export package exceeds ${MAX_BATCH_AGGREGATE_DIRECTORY_NODES} directory nodes`
      );
    }

    totalBytes += parsed.decodedBytes;
    if (totalBytes > MAX_BATCH_PACKAGE_TOTAL_BYTES) {
      throw new Error(`Popup export package exceeds ${MAX_BATCH_PACKAGE_TOTAL_BYTES} bytes`);
    }

    return parsedEntry;
  });
  const archiveRootDirectoryNodes = entries.length > 0 ? 1 : 0;
  if (directoryNodes.size + archiveRootDirectoryNodes > MAX_BATCH_AGGREGATE_DIRECTORY_NODES) {
    throw new Error(
      `Popup export package exceeds ${MAX_BATCH_AGGREGATE_DIRECTORY_NODES} directory nodes`
    );
  }

  return {
    ...pagePackage,
    archiveBaseName: parseSafeBatchArchiveBaseName(pagePackage.archiveBaseName),
    entries,
  };
}

export function getPopupBatchPagePackageResourceUsage(
  pagePackage: ExportPagePackage
): PopupBatchResourceUsage {
  const directoryNodes = new Set<string>();
  let decodedBytes = 0;
  for (const entry of pagePackage.entries) {
    decodedBytes += getBatchEntryDecodedBytes(entry);
    addEntryDirectoryNodes(entry.path, directoryNodes);
  }
  const archiveRootDirectoryNodes = pagePackage.entries.length > 0 ? 1 : 0;

  return {
    decodedBytes,
    directoryNodes: directoryNodes.size + archiveRootDirectoryNodes,
    entries: pagePackage.entries.length,
  };
}

export function wouldExceedPopupBatchAggregateBudget(
  currentBytes: number,
  nextPackageBytes: number
): boolean {
  return currentBytes + nextPackageBytes > MAX_BATCH_AGGREGATE_DECODED_BYTES;
}
