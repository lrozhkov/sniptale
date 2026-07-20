import {
  assertRange,
  checkedAdd,
  decodeAsciiPath,
  fail,
  readSafeUint64,
  readUint16,
  readUint32,
  requireSignature,
} from './bytes.js';
import type { ZipCentralDirectoryEntry } from './types.js';

const DATA_DESCRIPTOR_SIGNATURE = 0x08074b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP32_MAX = 0xffffffff;

interface InspectLocalEntryArgs {
  bytes: Uint8Array;
  centralDirectoryOffset: number;
  compressedSize: number;
  compressionMethod: number;
  crc32: number;
  directory: boolean;
  flags: number;
  localHeaderOffset: number;
  name: string;
  uncompressedSize: number;
  view: DataView;
}

export function inspectLocalEntry(args: InspectLocalEntryArgs): ZipCentralDirectoryEntry {
  requireSignature(
    args.view,
    args.localHeaderOffset,
    LOCAL_FILE_HEADER_SIGNATURE,
    'Local ZIP entry header is missing.',
    args.name
  );
  assertRange(args.localHeaderOffset, 30, args.bytes.byteLength, 'Local ZIP header is truncated.');
  const local = readLocalEntryHeader(args);
  const dataStartOffset = checkedAdd(
    args.localHeaderOffset,
    30,
    local.nameLength,
    local.extraLength
  );
  assertRange(
    args.localHeaderOffset + 30,
    local.nameLength + local.extraLength,
    args.bytes.byteLength,
    'Local ZIP metadata is truncated.'
  );
  const localName = decodeAsciiPath(
    args.bytes.subarray(args.localHeaderOffset + 30, args.localHeaderOffset + 30 + local.nameLength)
  );
  assertMatchingLocalHeader(args, local, localName);
  const usesDescriptor = (args.flags & 0x0008) !== 0;
  assertMatchingLocalSizes(args, local, usesDescriptor);
  const dataEndOffset = checkedAdd(dataStartOffset, args.compressedSize);
  if (dataEndOffset > args.centralDirectoryOffset) {
    fail('archive-invalid', 'ZIP entry data overlaps the central directory.', args.name);
  }
  const rangeEnd = usesDescriptor
    ? inspectDataDescriptor(args.view, dataEndOffset, args)
    : dataEndOffset;
  if (rangeEnd > args.centralDirectoryOffset) {
    fail('archive-invalid', 'ZIP data descriptor overlaps the central directory.', args.name);
  }
  return {
    compressedSize: args.compressedSize,
    compressionMethod: args.compressionMethod as 0 | 8,
    crc32: args.crc32,
    dataEndOffset: rangeEnd,
    dataStartOffset,
    directory: args.directory,
    localHeaderOffset: args.localHeaderOffset,
    name: args.name,
    uncompressedSize: args.uncompressedSize,
  };
}

function readLocalEntryHeader(args: InspectLocalEntryArgs) {
  return {
    compressedSize: readUint32(args.view, args.localHeaderOffset + 18),
    compressionMethod: readUint16(args.view, args.localHeaderOffset + 8),
    crc32: readUint32(args.view, args.localHeaderOffset + 14),
    extraLength: readUint16(args.view, args.localHeaderOffset + 28),
    flags: readUint16(args.view, args.localHeaderOffset + 6),
    nameLength: readUint16(args.view, args.localHeaderOffset + 26),
    uncompressedSize: readUint32(args.view, args.localHeaderOffset + 22),
  };
}

function assertMatchingLocalHeader(
  args: InspectLocalEntryArgs,
  local: ReturnType<typeof readLocalEntryHeader>,
  localName: string
): void {
  if (
    localName !== args.name ||
    local.flags !== args.flags ||
    local.compressionMethod !== args.compressionMethod
  ) {
    fail('archive-invalid', 'Local and central ZIP headers disagree.', args.name);
  }
}

function assertMatchingLocalSizes(
  args: InspectLocalEntryArgs,
  local: ReturnType<typeof readLocalEntryHeader>,
  usesDescriptor: boolean
): void {
  if (
    !usesDescriptor &&
    (local.crc32 !== args.crc32 ||
      local.compressedSize !== args.compressedSize ||
      local.uncompressedSize !== args.uncompressedSize)
  ) {
    fail(
      'archive-invalid',
      'Local ZIP sizes or CRC disagree with the central directory.',
      args.name
    );
  }
}

function inspectDataDescriptor(
  view: DataView,
  offset: number,
  expected: { compressedSize: number; crc32: number; name: string; uncompressedSize: number }
): number {
  let cursor = offset;
  if (readUint32(view, cursor) === DATA_DESCRIPTOR_SIGNATURE) cursor += 4;
  const zip64 = expected.compressedSize > ZIP32_MAX || expected.uncompressedSize > ZIP32_MAX;
  const size = zip64 ? 20 : 12;
  assertRange(cursor, size, view.byteLength, 'ZIP data descriptor is truncated.');
  const crc32 = readUint32(view, cursor);
  const compressed = zip64 ? readSafeUint64(view, cursor + 4) : readUint32(view, cursor + 4);
  const uncompressed = zip64 ? readSafeUint64(view, cursor + 12) : readUint32(view, cursor + 8);
  if (
    crc32 !== expected.crc32 ||
    compressed !== expected.compressedSize ||
    uncompressed !== expected.uncompressedSize
  ) {
    fail(
      'archive-invalid',
      'ZIP data descriptor disagrees with the central directory.',
      expected.name
    );
  }
  return cursor + size;
}
