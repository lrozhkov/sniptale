import { assertEffectDecodedRaster } from '../runtime/resource-limits';

const MAX_JPEG_HEADER_SCAN_BYTES = 1024 * 1024;

export type EffectRasterMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface EffectRasterHeader {
  height: number;
  mimeType: EffectRasterMimeType;
  width: number;
}

export class EffectRasterHeaderError extends Error {
  readonly code = 'mediaHeaderInvalid';

  constructor() {
    super('Effect raster header is invalid');
    this.name = 'EffectRasterHeaderError';
  }
}

export function inspectEffectRasterHeader(
  bytes: Uint8Array,
  mimeType: EffectRasterMimeType
): EffectRasterHeader {
  const dimensions =
    mimeType === 'image/png'
      ? inspectPng(bytes)
      : mimeType === 'image/jpeg'
        ? inspectJpeg(bytes)
        : inspectWebp(bytes);
  try {
    assertEffectDecodedRaster(dimensions.width, dimensions.height);
  } catch {
    throw new EffectRasterHeaderError();
  }
  return { ...dimensions, mimeType };
}

function inspectPng(bytes: Uint8Array): { height: number; width: number } {
  if (
    bytes.byteLength < 24 ||
    !matches(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ||
    readUint32BigEndian(bytes, 8) !== 13 ||
    readAscii(bytes, 12, 4) !== 'IHDR'
  ) {
    throw new EffectRasterHeaderError();
  }
  return {
    height: readUint32BigEndian(bytes, 20),
    width: readUint32BigEndian(bytes, 16),
  };
}

function inspectJpeg(bytes: Uint8Array): { height: number; width: number } {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new EffectRasterHeaderError();
  }
  const limit = Math.min(bytes.byteLength, MAX_JPEG_HEADER_SCAN_BYTES);
  let cursor = 2;
  while (cursor + 4 <= limit) {
    if (bytes[cursor] !== 0xff) throw new EffectRasterHeaderError();
    while (cursor < limit && bytes[cursor] === 0xff) cursor += 1;
    const marker = bytes[cursor++];
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (cursor + 2 > limit) throw new EffectRasterHeaderError();
    const length = readUint16BigEndian(bytes, cursor);
    if (length < 2 || cursor + length > limit) throw new EffectRasterHeaderError();
    if (isJpegStartOfFrame(marker)) {
      if (length < 7) throw new EffectRasterHeaderError();
      return {
        height: readUint16BigEndian(bytes, cursor + 3),
        width: readUint16BigEndian(bytes, cursor + 5),
      };
    }
    cursor += length;
  }
  throw new EffectRasterHeaderError();
}

function inspectWebp(bytes: Uint8Array): { height: number; width: number } {
  if (
    bytes.byteLength < 30 ||
    readAscii(bytes, 0, 4) !== 'RIFF' ||
    readAscii(bytes, 8, 4) !== 'WEBP' ||
    readUint32LittleEndian(bytes, 4) + 8 > bytes.byteLength
  ) {
    throw new EffectRasterHeaderError();
  }
  const chunk = readAscii(bytes, 12, 4);
  if (chunk === 'VP8X') {
    return {
      height: 1 + readUint24LittleEndian(bytes, 27),
      width: 1 + readUint24LittleEndian(bytes, 24),
    };
  }
  if (chunk === 'VP8L' && bytes[20] === 0x2f) {
    const b0 = bytes[21]!;
    const b1 = bytes[22]!;
    const b2 = bytes[23]!;
    const b3 = bytes[24]!;
    return {
      height: 1 + (b1 >> 6) + (b2 << 2) + ((b3 & 0x0f) << 10),
      width: 1 + b0 + ((b1 & 0x3f) << 8),
    };
  }
  if (chunk === 'VP8 ' && matches(bytes, 23, [0x9d, 0x01, 0x2a])) {
    return {
      height: readUint16LittleEndian(bytes, 28) & 0x3fff,
      width: readUint16LittleEndian(bytes, 26) & 0x3fff,
    };
  }
  throw new EffectRasterHeaderError();
}

function isJpegStartOfFrame(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function readUint16BigEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function readUint16LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

function readUint32LittleEndian(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function matches(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return expected.every((byte, index) => bytes[offset + index] === byte);
}
