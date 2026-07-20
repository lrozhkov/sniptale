import { assertRange, fail } from './bytes.js';
import { readCentralDirectoryEntries } from './central-entry-list.js';
import { readEndOfCentralDirectory } from './records.js';
import type {
  InspectZipCentralDirectoryOptions,
  ZipCentralDirectoryEntry,
  ZipCentralDirectoryProfile,
} from './types.js';

export { ZipCentralDirectoryError } from './errors.js';
export type { ZipCentralDirectoryErrorCode } from './errors.js';
export type * from './types.js';

export function inspectZipCentralDirectory(
  source: ArrayBuffer | Uint8Array,
  options: InspectZipCentralDirectoryOptions
): ZipCentralDirectoryProfile {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  if (bytes.byteLength === 0 || bytes.byteLength > options.maxArchiveBytes) {
    fail('limit-exceeded', 'ZIP archive size is outside the configured limit.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = readEndOfCentralDirectory(view);
  assertRange(
    end.centralDirectoryOffset,
    end.centralDirectorySize,
    bytes.byteLength,
    'Central directory is outside the archive.'
  );
  if (end.centralDirectoryOffset + end.centralDirectorySize > end.eocdOffset) {
    fail('archive-invalid', 'Central directory overlaps end-of-directory metadata.');
  }

  const entries = readCentralDirectoryEntries({ bytes, end, options, view });
  assertNonOverlappingEntries(entries.entries);
  return {
    centralDirectoryOffset: end.centralDirectoryOffset,
    centralDirectorySize: end.centralDirectorySize,
    ...entries,
    zip64: end.zip64,
  };
}

function assertNonOverlappingEntries(entries: readonly ZipCentralDirectoryEntry[]): void {
  const ordered = [...entries].sort(
    (left, right) => left.localHeaderOffset - right.localHeaderOffset
  );
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!;
    const current = ordered[index]!;
    if (current.localHeaderOffset < previous.dataEndOffset) {
      fail('archive-invalid', 'ZIP local entry ranges overlap.', current.name);
    }
  }
}
