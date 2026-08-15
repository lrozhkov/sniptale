import type { ExportPagePackage, ExportPagePackageEntry } from '@sniptale/runtime-contracts/export';
import { isSafeArchiveEntryLeafFilename } from '@sniptale/platform/data/zip-profile/entry-filenames';
import { hasAsciiControlCharacter } from '@sniptale/platform/security/sanitizers/text';
import {
  estimateBase64DecodedBytes,
  estimateUtf8Bytes,
  isCanonicalBase64,
} from '@sniptale/runtime-contracts/validation/base64';

const MAX_PACKAGE_ENTRIES = 2_000;
const MAX_PACKAGE_BYTES = 250 * 1024 * 1024;
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_AGGREGATE_BYTES = 250 * 1024 * 1024;
const MAX_AGGREGATE_ENTRIES = 10_000;
const MAX_AGGREGATE_DIRECTORY_NODES = 20_000;
const MAX_ARCHIVE_BASE_NAME_LENGTH = 160;
const MAX_ENTRY_PATH_LENGTH = 240;
export const MAX_POPUP_EXPORT_ENTRY_PATH_DEPTH = 16;

export type PopupExportPackageResourceUsage = {
  decodedBytes: number;
  directoryNodes: number;
  entries: number;
};

export const EMPTY_POPUP_EXPORT_PACKAGE_RESOURCE_USAGE: PopupExportPackageResourceUsage = {
  decodedBytes: 0,
  directoryNodes: 0,
  entries: 0,
};

function isUnsafePathSegment(segment: string): boolean {
  return segment === '' || segment === '.' || segment === '..';
}

function parseArchiveBaseName(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed !== value ||
    trimmed.length > MAX_ARCHIVE_BASE_NAME_LENGTH ||
    !isSafeArchiveEntryLeafFilename(trimmed)
  ) {
    throw new Error('Unsafe popup export package archive base name');
  }
  return trimmed;
}

function parseEntryPath(value: string): string {
  const trimmed = value.trim();
  const segments = trimmed.split('/');
  if (
    trimmed.length === 0 ||
    trimmed !== value ||
    trimmed.length > MAX_ENTRY_PATH_LENGTH ||
    trimmed.startsWith('/') ||
    /^[A-Za-z]:/u.test(trimmed) ||
    trimmed.includes('\\') ||
    hasAsciiControlCharacter(trimmed) ||
    segments.length > MAX_POPUP_EXPORT_ENTRY_PATH_DEPTH ||
    segments.some(
      (segment) => isUnsafePathSegment(segment) || !isSafeArchiveEntryLeafFilename(segment)
    )
  ) {
    throw new Error('Unsafe popup export package entry path');
  }
  return segments.join('/');
}

function assertEntryBytes(bytes: number): void {
  if (bytes > MAX_ENTRY_BYTES) {
    throw new Error(`Popup export package entry exceeds ${MAX_ENTRY_BYTES} bytes`);
  }
}

function parsePackageEntry(entry: ExportPagePackageEntry): {
  decodedBytes: number;
  entry: ExportPagePackageEntry;
} {
  const path = parseEntryPath(entry.path);
  const hasTextContent = typeof entry.textContent === 'string';
  const hasBinaryContent = typeof entry.binaryBase64 === 'string';
  if (hasTextContent === hasBinaryContent) {
    throw new Error('Popup export package entry must have exactly one content representation');
  }

  const metadata = {
    path,
    ...(typeof entry.mimeType === 'string' ? { mimeType: entry.mimeType } : {}),
  };
  if (typeof entry.textContent === 'string') {
    const decodedBytes = estimateUtf8Bytes(entry.textContent, MAX_ENTRY_BYTES);
    assertEntryBytes(decodedBytes);
    return { decodedBytes, entry: { ...metadata, textContent: entry.textContent } };
  }

  if (typeof entry.binaryBase64 === 'string') {
    const binaryBase64 = entry.binaryBase64;
    if (!isCanonicalBase64(binaryBase64)) {
      throw new Error('Invalid popup export package base64 entry');
    }
    const decodedBytes = estimateBase64DecodedBytes(binaryBase64);
    assertEntryBytes(decodedBytes);
    return { decodedBytes, entry: { ...metadata, binaryBase64 } };
  }

  throw new Error('Popup export package entry must have exactly one content representation');
}

function addDirectoryNodes(path: string, directoryNodes: Set<string>): void {
  const segments = path.split('/').slice(0, -1);
  let directoryPath = '';
  for (const segment of segments) {
    directoryPath = directoryPath ? `${directoryPath}/${segment}` : segment;
    directoryNodes.add(directoryPath);
  }
}

export function addPopupExportPackageResourceUsage(
  current: PopupExportPackageResourceUsage,
  next: PopupExportPackageResourceUsage
): PopupExportPackageResourceUsage {
  return {
    decodedBytes: current.decodedBytes + next.decodedBytes,
    directoryNodes: current.directoryNodes + next.directoryNodes,
    entries: current.entries + next.entries,
  };
}

export function assertPopupExportAggregateResourceUsage(
  usage: PopupExportPackageResourceUsage
): void {
  if (usage.entries > MAX_AGGREGATE_ENTRIES) {
    throw new Error(`Popup export aggregate exceeds ${MAX_AGGREGATE_ENTRIES} entries`);
  }
  if (usage.directoryNodes > MAX_AGGREGATE_DIRECTORY_NODES) {
    throw new Error(
      `Popup export aggregate exceeds ${MAX_AGGREGATE_DIRECTORY_NODES} directory nodes`
    );
  }
  if (usage.decodedBytes > MAX_AGGREGATE_BYTES) {
    throw new Error(`Popup export aggregate exceeds ${MAX_AGGREGATE_BYTES} decoded bytes`);
  }
}

export function assertPopupExportPackageResourceUsage(
  usage: PopupExportPackageResourceUsage
): void {
  if (usage.entries > MAX_PACKAGE_ENTRIES) {
    throw new Error(`Popup export package exceeds ${MAX_PACKAGE_ENTRIES} entries`);
  }
  if (usage.directoryNodes > MAX_AGGREGATE_DIRECTORY_NODES) {
    throw new Error(
      `Popup export package exceeds ${MAX_AGGREGATE_DIRECTORY_NODES} directory nodes`
    );
  }
  if (usage.decodedBytes > MAX_PACKAGE_BYTES) {
    throw new Error(`Popup export package exceeds ${MAX_PACKAGE_BYTES} bytes`);
  }
}

export function parsePopupExportPagePackageAtBoundary(pagePackage: ExportPagePackage): {
  pagePackage: ExportPagePackage;
  usage: PopupExportPackageResourceUsage;
} {
  assertPopupExportPackageResourceUsage({
    decodedBytes: 0,
    directoryNodes: 0,
    entries: pagePackage.entries.length,
  });

  let decodedBytes = 0;
  const directoryNodes = new Set<string>();
  const seenPaths = new Set<string>();
  const entries = pagePackage.entries.map((entry) => {
    const parsed = parsePackageEntry(entry);
    if (seenPaths.has(parsed.entry.path)) {
      throw new Error('Duplicate popup export package entry path');
    }
    seenPaths.add(parsed.entry.path);
    addDirectoryNodes(parsed.entry.path, directoryNodes);
    decodedBytes += parsed.decodedBytes;
    assertPopupExportPackageResourceUsage({
      decodedBytes,
      directoryNodes: directoryNodes.size,
      entries: seenPaths.size,
    });
    return parsed.entry;
  });
  const archiveRootDirectoryNodes = entries.length > 0 ? 1 : 0;
  const packageDirectoryNodes = directoryNodes.size + archiveRootDirectoryNodes;
  assertPopupExportPackageResourceUsage({
    decodedBytes,
    directoryNodes: packageDirectoryNodes,
    entries: entries.length,
  });

  return {
    pagePackage: {
      ...pagePackage,
      archiveBaseName: parseArchiveBaseName(pagePackage.archiveBaseName),
      entries,
    },
    usage: { decodedBytes, directoryNodes: packageDirectoryNodes, entries: entries.length },
  };
}
