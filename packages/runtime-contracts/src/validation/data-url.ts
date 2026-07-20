const DATA_URL_PREFIX = 'data:';
const BASE64_DATA_PATTERN = /^[a-z0-9+/]+=*$/i;
const MAX_IMAGE_DATA_URL_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_DATA_URL_ENCODED_LENGTH = Math.ceil((MAX_IMAGE_DATA_URL_BYTES * 4) / 3) + 128;
const MAX_IMAGE_DATA_URL_PIXELS = 100_000_000;
const MAX_IMAGE_DATA_URL_SIDE = 32_768;
const MAX_IMAGE_HEADER_BYTES = 65_536;
const ALLOWED_RASTER_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface ParsedDataUrl {
  decodedBytes: number;
  mimeType: string;
  payload: string;
}

interface ImageDimensions {
  height: number;
  width: number;
}

function estimateBase64DecodedBytes(payload: string): number {
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.floor((payload.length * 3) / 4) - padding;
}

function parseDataUrl(value: string): ParsedDataUrl | null {
  if (!value.startsWith(DATA_URL_PREFIX)) {
    return null;
  }

  const commaIndex = value.indexOf(',');
  if (commaIndex <= DATA_URL_PREFIX.length || commaIndex >= value.length - 1) {
    return null;
  }

  const metadata = value.slice(DATA_URL_PREFIX.length, commaIndex);
  const payload = value.slice(commaIndex + 1);
  const parts = metadata.split(';').map((part) => part.trim());
  const mimeType = (parts[0] ?? '').toLowerCase();
  const isBase64 = parts.some((part) => part.toLowerCase() === 'base64');

  if (!mimeType || payload.length === 0) {
    return null;
  }

  if (!isBase64) {
    return null;
  }

  if (!BASE64_DATA_PATTERN.test(payload)) {
    return null;
  }

  return { decodedBytes: estimateBase64DecodedBytes(payload), mimeType, payload };
}

function readUint16BigEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! * 256 + bytes[offset + 1]!;
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! * 16_777_216 +
    bytes[offset + 1]! * 65_536 +
    bytes[offset + 2]! * 256 +
    bytes[offset + 3]!
  );
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! + bytes[offset + 1]! * 256 + bytes[offset + 2]! * 65_536;
}

function readBase64HeaderBytes(payload: string): Uint8Array | null {
  const headerBase64Length = Math.min(payload.length, Math.ceil(MAX_IMAGE_HEADER_BYTES / 3) * 4);
  const alignedLength = headerBase64Length - (headerBase64Length % 4);
  if (alignedLength <= 0) {
    return null;
  }

  try {
    const binary = atob(payload.slice(0, alignedLength));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function readPngDimensions(bytes: Uint8Array): ImageDimensions | null {
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !pngSignature.every((byte, index) => bytes[index] === byte)) {
    return null;
  }

  return {
    height: readUint32BigEndian(bytes, 20),
    width: readUint32BigEndian(bytes, 16),
  };
}

function isJpegStartOfFrame(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function readJpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1]!;
    const segmentLength = readUint16BigEndian(bytes, offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) {
      return null;
    }

    if (isJpegStartOfFrame(marker)) {
      return {
        height: readUint16BigEndian(bytes, offset + 5),
        width: readUint16BigEndian(bytes, offset + 7),
      };
    }

    offset += 2 + segmentLength;
  }

  return null;
}

function readWebpDimensions(bytes: Uint8Array): ImageDimensions | null {
  const isRiffWebp =
    bytes.length >= 30 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
  if (!isRiffWebp) {
    return null;
  }

  if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x58) {
    return {
      height: readUint24LittleEndian(bytes, 27) + 1,
      width: readUint24LittleEndian(bytes, 24) + 1,
    };
  }

  return null;
}

function readImageDimensions(parsed: ParsedDataUrl): ImageDimensions | null {
  const bytes = readBase64HeaderBytes(parsed.payload);
  if (!bytes) {
    return null;
  }

  if (parsed.mimeType === 'image/png') {
    return readPngDimensions(bytes);
  }
  if (parsed.mimeType === 'image/jpeg') {
    return readJpegDimensions(bytes);
  }
  if (parsed.mimeType === 'image/webp') {
    return readWebpDimensions(bytes);
  }

  return null;
}

function hasAllowedDimensions(dimensions: ImageDimensions | null): boolean {
  if (!dimensions) {
    return true;
  }

  const { height, width } = dimensions;
  return (
    width > 0 &&
    height > 0 &&
    width <= MAX_IMAGE_DATA_URL_SIDE &&
    height <= MAX_IMAGE_DATA_URL_SIDE &&
    width * height <= MAX_IMAGE_DATA_URL_PIXELS
  );
}

export function isImageDataUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  if (value.length > MAX_IMAGE_DATA_URL_ENCODED_LENGTH) {
    return false;
  }

  const parsed = parseDataUrl(value);
  return (
    parsed !== null &&
    ALLOWED_RASTER_IMAGE_MIME_TYPES.has(parsed.mimeType) &&
    parsed.decodedBytes <= MAX_IMAGE_DATA_URL_BYTES &&
    hasAllowedDimensions(readImageDimensions(parsed))
  );
}
