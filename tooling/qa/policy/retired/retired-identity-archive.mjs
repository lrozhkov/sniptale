import JSZip from 'jszip';

const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_ARCHIVE_ENTRY_COUNT = 4_096;
const MAX_ARCHIVE_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_ARCHIVE_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_ARCHIVE_COMPRESSION_RATIO = 200;

export function decodeIdentityText(bytes) {
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function assertArchiveEntryBudget(entry) {
  const compressedSize = entry._data?.compressedSize;
  const uncompressedSize = entry._data?.uncompressedSize;
  if (
    !Number.isSafeInteger(compressedSize) ||
    compressedSize < 0 ||
    !Number.isSafeInteger(uncompressedSize) ||
    uncompressedSize < 0
  ) {
    throw new Error('archive entry size metadata is invalid');
  }
  if (uncompressedSize > MAX_ARCHIVE_ENTRY_BYTES) {
    throw new Error('archive per-entry size limit exceeded');
  }
  if (
    uncompressedSize > 0 &&
    uncompressedSize / Math.max(1, compressedSize) > MAX_ARCHIVE_COMPRESSION_RATIO
  ) {
    throw new Error('archive compression-ratio limit exceeded');
  }
  return uncompressedSize;
}

export async function loadBoundedIdentityArchive(bytes) {
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error('archive compressed-size limit exceeded');
  }
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const entries = Object.values(zip.files).sort((left, right) =>
    left.name.localeCompare(right.name)
  );
  if (entries.length > MAX_ARCHIVE_ENTRY_COUNT) {
    throw new Error('archive entry-count limit exceeded');
  }
  let aggregateUncompressedBytes = 0;
  for (const entry of entries) {
    if (entry.dir) continue;
    aggregateUncompressedBytes += assertArchiveEntryBudget(entry);
    if (aggregateUncompressedBytes > MAX_ARCHIVE_TOTAL_BYTES) {
      throw new Error('archive aggregate size limit exceeded');
    }
  }
  return entries;
}
