import {
  assertRange,
  fail,
  findExtraField,
  readSafeUint64,
  readUint16,
  readUint32,
  requireSignature,
} from './bytes.js';

const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const ZIP64_EXTRA_FIELD_ID = 0x0001;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP32_MAX = 0xffffffff;
const ZIP16_MAX = 0xffff;
const MAX_EOCD_SEARCH_BYTES = ZIP16_MAX + 22;

export interface EndOfCentralDirectory {
  centralDirectoryOffset: number;
  centralDirectorySize: number;
  entryCount: number;
  eocdOffset: number;
  zip64: boolean;
}

interface CentralEntryFields {
  compressedSize: number;
  localHeaderOffset: number;
  uncompressedSize: number;
}

export function readEndOfCentralDirectory(view: DataView): EndOfCentralDirectory {
  const minimum = Math.max(0, view.byteLength - MAX_EOCD_SEARCH_BYTES);
  let eocdOffset = -1;
  for (let cursor = view.byteLength - 22; cursor >= minimum; cursor -= 1) {
    if (readUint32(view, cursor) !== EOCD_SIGNATURE) continue;
    const commentLength = readUint16(view, cursor + 20);
    if (cursor + 22 + commentLength === view.byteLength) {
      eocdOffset = cursor;
      break;
    }
  }
  if (eocdOffset < 0) fail('archive-invalid', 'ZIP end-of-central-directory record is missing.');
  const disk = readUint16(view, eocdOffset + 4);
  const centralDisk = readUint16(view, eocdOffset + 6);
  const diskEntries = readUint16(view, eocdOffset + 8);
  const totalEntries = readUint16(view, eocdOffset + 10);
  const centralSize32 = readUint32(view, eocdOffset + 12);
  const centralOffset32 = readUint32(view, eocdOffset + 16);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== totalEntries)
    fail('archive-invalid', 'Multi-disk ZIP archives are unsupported.');
  const needsZip64 =
    totalEntries === ZIP16_MAX || centralSize32 === ZIP32_MAX || centralOffset32 === ZIP32_MAX;
  return needsZip64
    ? readZip64End(view, eocdOffset)
    : {
        centralDirectoryOffset: centralOffset32,
        centralDirectorySize: centralSize32,
        entryCount: totalEntries,
        eocdOffset,
        zip64: false,
      };
}

function readZip64End(view: DataView, eocdOffset: number): EndOfCentralDirectory {
  const locatorOffset = eocdOffset - 20;
  requireSignature(view, locatorOffset, ZIP64_LOCATOR_SIGNATURE, 'ZIP64 locator is missing.');
  const diskWithRecord = readUint32(view, locatorOffset + 4);
  const zip64Offset = readSafeUint64(view, locatorOffset + 8);
  const diskCount = readUint32(view, locatorOffset + 16);
  if (diskWithRecord !== 0 || diskCount !== 1)
    fail('archive-invalid', 'Multi-disk ZIP64 archives are unsupported.');
  requireSignature(view, zip64Offset, ZIP64_EOCD_SIGNATURE, 'ZIP64 end record is missing.');
  assertRange(zip64Offset, 56, view.byteLength, 'ZIP64 end record is truncated.');
  const recordSize = readSafeUint64(view, zip64Offset + 4);
  if (recordSize < 44 || zip64Offset + 12 + recordSize !== locatorOffset)
    fail('archive-invalid', 'ZIP64 end record has an invalid size.');
  const disk = readUint32(view, zip64Offset + 16);
  const centralDisk = readUint32(view, zip64Offset + 20);
  const diskEntries = readSafeUint64(view, zip64Offset + 24);
  const totalEntries = readSafeUint64(view, zip64Offset + 32);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== totalEntries)
    fail('archive-invalid', 'ZIP64 disk metadata is inconsistent.');
  return {
    centralDirectoryOffset: readSafeUint64(view, zip64Offset + 48),
    centralDirectorySize: readSafeUint64(view, zip64Offset + 40),
    entryCount: totalEntries,
    eocdOffset: zip64Offset,
    zip64: true,
  };
}

export function resolveCentralEntryFields(args: {
  compressed32: number;
  diskStart: number;
  extra: Uint8Array;
  localOffset32: number;
  uncompressed32: number;
}): CentralEntryFields {
  const needsUncompressed = args.uncompressed32 === ZIP32_MAX;
  const needsCompressed = args.compressed32 === ZIP32_MAX;
  const needsOffset = args.localOffset32 === ZIP32_MAX;
  const needsDisk = args.diskStart === ZIP16_MAX;
  if (!needsUncompressed && !needsCompressed && !needsOffset && !needsDisk) {
    return {
      compressedSize: args.compressed32,
      localHeaderOffset: args.localOffset32,
      uncompressedSize: args.uncompressed32,
    };
  }
  const zip64 = findExtraField(args.extra, ZIP64_EXTRA_FIELD_ID);
  if (!zip64) fail('archive-invalid', 'ZIP64 entry metadata is missing.');
  return readZip64EntryFields(args, zip64, {
    needsCompressed,
    needsDisk,
    needsOffset,
    needsUncompressed,
  });
}

function readZip64EntryFields(
  args: { compressed32: number; diskStart: number; localOffset32: number; uncompressed32: number },
  zip64: Uint8Array,
  needs: {
    needsCompressed: boolean;
    needsDisk: boolean;
    needsOffset: boolean;
    needsUncompressed: boolean;
  }
): CentralEntryFields {
  const view = new DataView(zip64.buffer, zip64.byteOffset, zip64.byteLength);
  let cursor = 0;
  const readNext64 = () => {
    assertRange(cursor, 8, view.byteLength, 'ZIP64 entry metadata is truncated.');
    const value = readSafeUint64(view, cursor);
    cursor += 8;
    return value;
  };
  const uncompressedSize = needs.needsUncompressed ? readNext64() : args.uncompressed32;
  const compressedSize = needs.needsCompressed ? readNext64() : args.compressed32;
  const localHeaderOffset = needs.needsOffset ? readNext64() : args.localOffset32;
  if (needs.needsDisk) {
    assertRange(cursor, 4, view.byteLength, 'ZIP64 disk metadata is truncated.');
    if (readUint32(view, cursor) !== 0) fail('archive-invalid', 'Multi-disk ZIP64 is unsupported.');
    cursor += 4;
  }
  if (cursor !== view.byteLength)
    fail('archive-invalid', 'ZIP64 entry metadata has unexpected trailing fields.');
  return { compressedSize, localHeaderOffset, uncompressedSize };
}
