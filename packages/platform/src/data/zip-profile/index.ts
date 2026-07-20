import type JSZip from 'jszip';

interface ZipCompressedData {
  compressedSize: unknown;
  uncompressedSize: unknown;
}

interface ZipProfileEntry extends JSZip.JSZipObject {
  _data?: unknown;
}

interface ZipEntryInflationMetadata {
  compressedSizeBytes: number;
  uncompressedSizeBytes: number;
}

interface ZipPackageProfileOptions {
  assertPath?: (path: string) => void;
  createEntryError: (path: string) => Error;
  createFileCountError: () => Error;
  createTotalError: () => Error;
  maxCompressionRatio?: number;
  maxFileCount: number;
  maxTotalBytes: number;
  resolveEntryMaxBytes?: (path: string) => number;
}

const DEFAULT_ZIP_MAX_COMPRESSION_RATIO = 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readZipCompressedData(entry: JSZip.JSZipObject): ZipCompressedData | null {
  const data = (entry as ZipProfileEntry)._data;
  if (isRecord(data) && typeof data['then'] === 'function') {
    return { compressedSize: 0, uncompressedSize: 0 };
  }
  if (!isRecord(data)) {
    return null;
  }

  return {
    compressedSize: data['compressedSize'],
    uncompressedSize: data['uncompressedSize'],
  };
}

function isSafeZipSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function readZipEntryInflationMetadata(entry: JSZip.JSZipObject): ZipEntryInflationMetadata | null {
  const data = readZipCompressedData(entry);
  if (!data || !isSafeZipSize(data.compressedSize) || !isSafeZipSize(data.uncompressedSize)) {
    return null;
  }

  return {
    compressedSizeBytes: data.compressedSize,
    uncompressedSizeBytes: data.uncompressedSize,
  };
}

function isZipEntryCompressionRatioAllowed(
  metadata: ZipEntryInflationMetadata,
  maxCompressionRatio = DEFAULT_ZIP_MAX_COMPRESSION_RATIO
): boolean {
  if (metadata.uncompressedSizeBytes === 0) {
    return true;
  }
  if (metadata.compressedSizeBytes <= 0) {
    return false;
  }

  return metadata.uncompressedSizeBytes / metadata.compressedSizeBytes <= maxCompressionRatio;
}

export function assertZipEntryCanInflate(
  entry: JSZip.JSZipObject,
  maxBytes: number,
  createError: (path: string) => Error,
  maxCompressionRatio = DEFAULT_ZIP_MAX_COMPRESSION_RATIO
): number {
  const metadata = readZipEntryInflationMetadata(entry);
  if (
    !metadata ||
    metadata.uncompressedSizeBytes > maxBytes ||
    !isZipEntryCompressionRatioAllowed(metadata, maxCompressionRatio)
  ) {
    throw createError(entry.name);
  }

  return metadata.uncompressedSizeBytes;
}

export function assertZipPackageInflationProfile(
  entries: JSZip.JSZipObject[],
  options: ZipPackageProfileOptions
): number {
  const files = entries.filter((entry) => !entry.dir);
  if (files.length > options.maxFileCount) {
    throw options.createFileCountError();
  }

  let totalBytes = 0;
  for (const entry of files) {
    const path = entry.name;
    options.assertPath?.(entry.unsafeOriginalName ?? path);
    options.assertPath?.(path);
    const maxEntryBytes = options.resolveEntryMaxBytes?.(path) ?? options.maxTotalBytes;
    const entryBytes = assertZipEntryCanInflate(
      entry,
      maxEntryBytes,
      options.createEntryError,
      options.maxCompressionRatio
    );
    totalBytes += entryBytes;
    if (totalBytes > options.maxTotalBytes) {
      throw options.createTotalError();
    }
  }

  return totalBytes;
}
