import type { ExportPagePackage, ExportPagePackageEntry } from '@sniptale/runtime-contracts/export';
import { isSafeArchiveEntryLeafFilename } from '@sniptale/platform/data/zip-profile/entry-filenames';
import {
  estimateBase64DecodedBytes,
  isCanonicalBase64,
} from '@sniptale/runtime-contracts/validation/base64';
import { hasAsciiControlCharacter } from '@sniptale/platform/security/sanitizers/text';

const MAX_BATCH_PACKAGE_ENTRIES = 2_000;
const MAX_BATCH_PACKAGE_TOTAL_BYTES = 250 * 1024 * 1024;
const MAX_BATCH_PACKAGE_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_BATCH_ARCHIVE_BASE_NAME_LENGTH = 160;
const MAX_BATCH_ENTRY_PATH_LENGTH = 240;
const POSIX_PATH_SEPARATOR = '/';

const textEncoder = new TextEncoder();

function getTextBytes(value: string): number {
  return textEncoder.encode(value).byteLength;
}

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

function parseBatchPackageEntry(entry: ExportPagePackageEntry): ExportPagePackageEntry {
  const path = parseSafeBatchEntryPath(entry.path);
  if (typeof entry.textContent === 'string') {
    assertEntryBytes(getTextBytes(entry.textContent));
    return { ...entry, path };
  }

  if (typeof entry.binaryBase64 === 'string') {
    if (!isCanonicalBase64(entry.binaryBase64)) {
      throw new Error('Invalid popup export package base64 entry');
    }
    assertEntryBytes(estimateBase64DecodedBytes(entry.binaryBase64));
    return { ...entry, path };
  }

  throw new Error('Popup export package entry has no content');
}

export function parsePopupBatchPagePackageAtBoundary(
  pagePackage: ExportPagePackage
): ExportPagePackage {
  if (pagePackage.entries.length > MAX_BATCH_PACKAGE_ENTRIES) {
    throw new Error(`Popup export package exceeds ${MAX_BATCH_PACKAGE_ENTRIES} entries`);
  }

  let totalBytes = 0;
  const seenPaths = new Set<string>();
  const entries = pagePackage.entries.map((entry) => {
    const parsedEntry = parseBatchPackageEntry(entry);
    if (seenPaths.has(parsedEntry.path)) {
      throw new Error('Duplicate popup export package entry path');
    }
    seenPaths.add(parsedEntry.path);

    totalBytes +=
      typeof parsedEntry.textContent === 'string'
        ? getTextBytes(parsedEntry.textContent)
        : estimateBase64DecodedBytes(parsedEntry.binaryBase64 ?? '');
    if (totalBytes > MAX_BATCH_PACKAGE_TOTAL_BYTES) {
      throw new Error(`Popup export package exceeds ${MAX_BATCH_PACKAGE_TOTAL_BYTES} bytes`);
    }

    return parsedEntry;
  });

  return {
    ...pagePackage,
    archiveBaseName: parseSafeBatchArchiveBaseName(pagePackage.archiveBaseName),
    entries,
  };
}
