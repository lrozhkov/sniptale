import { ZipCentralDirectoryError, type ZipCentralDirectoryErrorCode } from './errors.js';

export function decodeAsciiPath(bytes: Uint8Array): string {
  if (bytes.byteLength === 0) fail('archive-invalid', 'ZIP entry name is empty.');
  let result = '';
  for (const byte of bytes) {
    if (byte < 0x20 || byte > 0x7e)
      fail('archive-invalid', 'ZIP entry names must be printable ASCII.');
    result += String.fromCharCode(byte);
  }
  return result;
}

export function findExtraField(extra: Uint8Array, expectedId: number): Uint8Array | null {
  const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength);
  let cursor = 0;
  while (cursor < extra.byteLength) {
    assertRange(cursor, 4, extra.byteLength, 'ZIP extra field header is truncated.');
    const id = readUint16(view, cursor);
    const size = readUint16(view, cursor + 2);
    cursor += 4;
    assertRange(cursor, size, extra.byteLength, 'ZIP extra field body is truncated.');
    if (id === expectedId) return extra.subarray(cursor, cursor + size);
    cursor += size;
  }
  return null;
}

export function requireSignature(
  view: DataView,
  offset: number,
  signature: number,
  message: string,
  path: string | null = null
): void {
  if (offset < 0 || offset + 4 > view.byteLength || readUint32(view, offset) !== signature) {
    fail('archive-invalid', message, path);
  }
}

export function assertRange(offset: number, size: number, total: number, message: string): void {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(size) ||
    offset < 0 ||
    size < 0 ||
    offset > total ||
    size > total - offset
  )
    fail('archive-invalid', message);
}

export function checkedAdd(...values: number[]): number {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0 || total > Number.MAX_SAFE_INTEGER - value) {
      fail('archive-invalid', 'ZIP integer arithmetic overflowed.');
    }
    total += value;
  }
  return total;
}

export function readUint16(view: DataView, offset: number): number {
  assertRange(offset, 2, view.byteLength, 'ZIP integer is truncated.');
  return view.getUint16(offset, true);
}

export function readUint32(view: DataView, offset: number): number {
  assertRange(offset, 4, view.byteLength, 'ZIP integer is truncated.');
  return view.getUint32(offset, true);
}

export function readSafeUint64(view: DataView, offset: number): number {
  assertRange(offset, 8, view.byteLength, 'ZIP64 integer is truncated.');
  const value = view.getBigUint64(offset, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    fail('archive-invalid', 'ZIP64 integer exceeds the safe JavaScript range.');
  return Number(value);
}

export function fail(
  code: ZipCentralDirectoryErrorCode,
  message: string,
  path: string | null = null
): never {
  throw new ZipCentralDirectoryError(code, message, path);
}
