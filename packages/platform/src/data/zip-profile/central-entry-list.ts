import { checkedAdd, fail } from './bytes.js';
import { readCentralDirectoryEntry } from './central-entry.js';
import type { EndOfCentralDirectory } from './records.js';
import type { InspectZipCentralDirectoryOptions, ZipCentralDirectoryEntry } from './types.js';

export function readCentralDirectoryEntries(args: {
  bytes: Uint8Array;
  end: EndOfCentralDirectory;
  options: InspectZipCentralDirectoryOptions;
  view: DataView;
}): {
  entries: ZipCentralDirectoryEntry[];
  regularFileCount: number;
  totalCompressedBytes: number;
  totalUncompressedBytes: number;
} {
  const entries: ZipCentralDirectoryEntry[] = [];
  const names = new Set<string>();
  const normalizedNames = new Set<string>();
  let cursor = args.end.centralDirectoryOffset;
  let regularFileCount = 0;
  let totalCompressedBytes = 0;
  let totalUncompressedBytes = 0;
  for (let index = 0; index < args.end.entryCount; index += 1) {
    const parsed = readCentralDirectoryEntry({
      ...(args.options.assertPath ? { assertPath: args.options.assertPath } : {}),
      bytes: args.bytes,
      centralDirectoryOffset: args.end.centralDirectoryOffset,
      cursor,
      maxEntryBytes: args.options.maxEntryBytes,
      names,
      normalizedNames,
      view: args.view,
    });
    entries.push(parsed.entry);
    cursor = parsed.nextCursor;
    if (parsed.entry.directory) continue;
    assertCompressionRatio(parsed.entry, args.options.maxCompressionRatio);
    regularFileCount += 1;
    if (regularFileCount > args.options.maxFileCount) {
      fail('limit-exceeded', 'ZIP archive contains too many regular files.');
    }
    totalCompressedBytes = checkedAdd(totalCompressedBytes, parsed.entry.compressedSize);
    totalUncompressedBytes = checkedAdd(totalUncompressedBytes, parsed.entry.uncompressedSize);
    if (totalUncompressedBytes > args.options.maxTotalInflatedBytes) {
      fail('limit-exceeded', 'ZIP archive exceeds the total inflated size limit.');
    }
  }
  if (cursor !== args.end.centralDirectoryOffset + args.end.centralDirectorySize) {
    fail('archive-invalid', 'Central directory size or entry count does not match its records.');
  }
  return { entries, regularFileCount, totalCompressedBytes, totalUncompressedBytes };
}

function assertCompressionRatio(
  entry: ZipCentralDirectoryEntry,
  maxCompressionRatio: number
): void {
  if (entry.uncompressedSize === 0) return;
  if (
    entry.compressedSize === 0 ||
    entry.uncompressedSize / entry.compressedSize > maxCompressionRatio
  ) {
    fail('limit-exceeded', 'ZIP entry exceeds the compression ratio limit.', entry.name);
  }
}
