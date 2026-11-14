import {
  inspectZipCentralDirectory,
  ZipCentralDirectoryError,
  type ZipCentralDirectoryEntry,
} from '@sniptale/platform/data/zip-profile/central-directory';

import { createEffectBundleFailure, type EffectBundleFailure } from '../../diagnostics';
import { EFFECT_BUNDLE_LIMITS } from '../../limits';
import { isCanonicalEffectBundlePath } from '../../path';

export function assertEffectBundleZipLimits(bytes: Uint8Array) {
  return inspectZipCentralDirectory(bytes, {
    assertPath: assertSafeZipPath,
    maxArchiveBytes: EFFECT_BUNDLE_LIMITS.maxArchiveBytes,
    maxCompressionRatio: EFFECT_BUNDLE_LIMITS.maxCompressionRatio,
    maxEntryBytes: EFFECT_BUNDLE_LIMITS.maxEntryBytes,
    maxFileCount: EFFECT_BUNDLE_LIMITS.maxFiles,
    maxTotalInflatedBytes: EFFECT_BUNDLE_LIMITS.maxInflatedBytes,
  });
}

export async function readZipEntry(
  archiveBytes: Uint8Array,
  entry: ZipCentralDirectoryEntry
): Promise<{ bytes: Uint8Array; ok: true } | EffectBundleFailure> {
  try {
    const bytes = await materializeBoundedZipEntryBytes(archiveBytes, entry);
    return bytes
      ? { bytes, ok: true }
      : createEffectBundleFailure('BUNDLE_ENTRY_SIZE_MISMATCH', entry.name);
  } catch {
    return createEffectBundleFailure('BUNDLE_ARCHIVE_INVALID', entry.name);
  }
}

async function materializeBoundedZipEntryBytes(
  archiveBytes: Uint8Array,
  entry: ZipCentralDirectoryEntry
): Promise<Uint8Array | null> {
  const compressed = archiveBytes.subarray(
    entry.dataStartOffset,
    entry.dataStartOffset + entry.compressedSize
  );
  if (entry.compressionMethod === 0) {
    return compressed.byteLength === entry.uncompressedSize ? compressed.slice() : null;
  }

  const compressedBuffer = new ArrayBuffer(compressed.byteLength);
  new Uint8Array(compressedBuffer).set(compressed);
  const stream = new Blob([compressedBuffer])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const bytes = new Uint8Array(entry.uncompressedSize);
  let offset = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (offset + chunk.value.byteLength > bytes.byteLength) {
        await reader.cancel('Animation ZIP entry exceeds its declared size.');
        return null;
      }
      bytes.set(chunk.value, offset);
      offset += chunk.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  return offset === bytes.byteLength ? bytes : null;
}

export function isExecutableEntry(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    /(?:^|\/)(?:renderers?|recipes?)(?:\/|$)/.test(lower) ||
    /\.(?:cjs|js|jsx|mjs|source|ts|tsx|wasm)$/.test(lower)
  );
}

export function mapArchiveError(error: unknown): EffectBundleFailure {
  if (isEffectBundleFailure(error)) return error;
  if (!(error instanceof ZipCentralDirectoryError)) {
    return createEffectBundleFailure('BUNDLE_ARCHIVE_INVALID', '$archive');
  }
  const code =
    error.code === 'limit-exceeded'
      ? 'BUNDLE_LIMIT_EXCEEDED'
      : error.code === 'entry-collision'
        ? 'BUNDLE_ENTRY_COLLISION'
        : error.code === 'entry-special'
          ? 'BUNDLE_ENTRY_SPECIAL'
          : 'BUNDLE_ARCHIVE_INVALID';
  return createEffectBundleFailure(code, error.path ?? '$archive');
}

function assertSafeZipPath(path: string): void {
  const candidate = path.endsWith('/') ? path.slice(0, -1) : path;
  if (!isCanonicalEffectBundlePath(candidate)) {
    throw createEffectBundleFailure('BUNDLE_ENTRY_PATH_UNSAFE', path);
  }
}

function isEffectBundleFailure(value: unknown): value is EffectBundleFailure {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { ok?: unknown }).ok === false &&
    typeof (value as { primaryCode?: unknown }).primaryCode === 'string'
  );
}
