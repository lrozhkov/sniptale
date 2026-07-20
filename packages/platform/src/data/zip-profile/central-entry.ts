import {
  assertRange,
  checkedAdd,
  decodeAsciiPath,
  fail,
  readUint16,
  readUint32,
  requireSignature,
} from './bytes.js';
import { inspectLocalEntry } from './local-entry.js';
import { resolveCentralEntryFields } from './records.js';
import type { ZipCentralDirectoryEntry } from './types.js';

const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP16_MAX = 0xffff;
const ALLOWED_GENERAL_PURPOSE_FLAGS = 0x0006 | 0x0008 | 0x0800;

interface ReadCentralDirectoryEntryArgs {
  assertPath?: (path: string) => void;
  bytes: Uint8Array;
  centralDirectoryOffset: number;
  cursor: number;
  maxEntryBytes: number;
  names: Set<string>;
  normalizedNames: Set<string>;
  view: DataView;
}

export function readCentralDirectoryEntry(args: ReadCentralDirectoryEntryArgs): {
  entry: ZipCentralDirectoryEntry;
  nextCursor: number;
} {
  requireSignature(
    args.view,
    args.cursor,
    CENTRAL_DIRECTORY_SIGNATURE,
    'Central directory entry is missing.'
  );
  assertRange(args.cursor, 46, args.bytes.byteLength, 'Central directory entry is truncated.');
  const header = readCentralEntryHeader(args.view, args.cursor);
  const { extra, name, variableLength } = readCentralEntryMetadata(args, header);
  validateCentralEntryHeader(header, name);
  const fields = resolveCentralEntryFields({
    compressed32: header.compressed32,
    diskStart: header.diskStart,
    extra,
    localOffset32: header.localOffset32,
    uncompressed32: header.uncompressed32,
  });
  const directory = name.endsWith('/');
  assertRegularOrDirectory(header.versionMadeBy, header.externalAttributes, directory, name);
  assertUniqueName(name, args.names, args.normalizedNames);
  args.assertPath?.(name);
  if (!directory && fields.uncompressedSize > args.maxEntryBytes) {
    fail('limit-exceeded', 'ZIP entry exceeds the inflated size limit.', name);
  }
  return {
    entry: inspectResolvedLocalEntry(args, header, fields, directory, name),
    nextCursor: args.cursor + 46 + variableLength,
  };
}

function readCentralEntryMetadata(
  args: ReadCentralDirectoryEntryArgs,
  header: ReturnType<typeof readCentralEntryHeader>
): { extra: Uint8Array; name: string; variableLength: number } {
  const variableLength = checkedAdd(header.nameLength, header.extraLength, header.commentLength);
  assertRange(
    args.cursor + 46,
    variableLength,
    args.bytes.byteLength,
    'Central entry metadata is truncated.'
  );
  const nameEnd = args.cursor + 46 + header.nameLength;
  return {
    extra: args.bytes.subarray(nameEnd, nameEnd + header.extraLength),
    name: decodeAsciiPath(args.bytes.subarray(args.cursor + 46, nameEnd)),
    variableLength,
  };
}

function inspectResolvedLocalEntry(
  args: ReadCentralDirectoryEntryArgs,
  header: ReturnType<typeof readCentralEntryHeader>,
  fields: ReturnType<typeof resolveCentralEntryFields>,
  directory: boolean,
  name: string
): ZipCentralDirectoryEntry {
  return inspectLocalEntry({
    bytes: args.bytes,
    centralDirectoryOffset: args.centralDirectoryOffset,
    compressedSize: fields.compressedSize,
    compressionMethod: header.compressionMethod,
    crc32: header.crc32,
    directory,
    flags: header.flags,
    localHeaderOffset: fields.localHeaderOffset,
    name,
    uncompressedSize: fields.uncompressedSize,
    view: args.view,
  });
}

function readCentralEntryHeader(view: DataView, cursor: number) {
  return {
    versionMadeBy: readUint16(view, cursor + 4),
    flags: readUint16(view, cursor + 8),
    compressionMethod: readUint16(view, cursor + 10),
    crc32: readUint32(view, cursor + 16),
    compressed32: readUint32(view, cursor + 20),
    uncompressed32: readUint32(view, cursor + 24),
    nameLength: readUint16(view, cursor + 28),
    extraLength: readUint16(view, cursor + 30),
    commentLength: readUint16(view, cursor + 32),
    diskStart: readUint16(view, cursor + 34),
    externalAttributes: readUint32(view, cursor + 38),
    localOffset32: readUint32(view, cursor + 42),
  };
}

function validateCentralEntryHeader(
  header: ReturnType<typeof readCentralEntryHeader>,
  name: string
): void {
  if ((header.flags & ~ALLOWED_GENERAL_PURPOSE_FLAGS) !== 0 || (header.flags & 0x0001) !== 0) {
    fail('entry-unsupported', 'Encrypted or unsupported ZIP entry flags are forbidden.', name);
  }
  if (header.compressionMethod !== 0 && header.compressionMethod !== 8) {
    fail('entry-unsupported', 'ZIP entry uses an unsupported compression method.', name);
  }
  if (header.diskStart !== 0 && header.diskStart !== ZIP16_MAX) {
    fail('archive-invalid', 'Multi-disk ZIP entries are unsupported.', name);
  }
}

function assertRegularOrDirectory(
  versionMadeBy: number,
  externalAttributes: number,
  directory: boolean,
  path: string
): void {
  const host = versionMadeBy >>> 8;
  if (host !== 3) return;
  const kind = (externalAttributes >>> 16) & 0o170000;
  if (kind !== 0 && kind !== 0o100000 && !(directory && kind === 0o040000)) {
    fail('entry-special', 'ZIP entry is not a regular file or directory.', path);
  }
}

function assertUniqueName(name: string, exact: Set<string>, normalized: Set<string>): void {
  const normalizedName = name.normalize('NFC').toLowerCase();
  if (exact.has(name) || normalized.has(normalizedName)) {
    fail('entry-collision', 'ZIP entry name collides with another entry.', name);
  }
  exact.add(name);
  normalized.add(normalizedName);
}
