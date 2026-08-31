// policyStateIds: [] - image MIME and decoder limits are static validation policy, not mutable authority.
import { measureImageBlob } from '@sniptale/platform/browser/media/image-dimensions';
import { FULL_PAGE_QUALITY_ABSOLUTE_LIMITS } from '../../contracts/full-page-capture';
import { WEB_SNAPSHOT_PACKAGE_POLICY } from './package-policy';

const MAX_WEB_SNAPSHOT_SCREENSHOT_BYTES = WEB_SNAPSHOT_PACKAGE_POLICY.maxScreenshotBytes;
const MAX_WEB_SNAPSHOT_SCREENSHOT_SIDE_PX = FULL_PAGE_QUALITY_ABSOLUTE_LIMITS.maxRasterSidePx;
const MAX_WEB_SNAPSHOT_SCREENSHOT_AREA_PX =
  FULL_PAGE_QUALITY_ABSOLUTE_LIMITS.maxMegapixels * 1_000_000;

const MAX_IMAGE_HEADER_BYTES = 65_536;
const WEB_SNAPSHOT_SCREENSHOT_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type WebSnapshotImageDimensions = { height: number; width: number };

function readUint16BigEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! * 256 + bytes[offset + 1]!;
}

function readUint16LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! + bytes[offset + 1]! * 256;
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! + bytes[offset + 1]! * 256 + bytes[offset + 2]! * 65_536;
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! * 16_777_216 +
    bytes[offset + 1]! * 65_536 +
    bytes[offset + 2]! * 256 +
    bytes[offset + 3]!
  );
}

function readPngDimensions(bytes: Uint8Array): WebSnapshotImageDimensions | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !signature.every((byte, index) => bytes[index] === byte)) return null;
  return { height: readUint32BigEndian(bytes, 20), width: readUint32BigEndian(bytes, 16) };
}

function isJpegStartOfFrame(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function readJpegDimensions(bytes: Uint8Array): WebSnapshotImageDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1]!;
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const segmentLength = readUint16BigEndian(bytes, offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) return null;
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

function hasRiffWebpSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 30 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

function readWebpDimensions(bytes: Uint8Array): WebSnapshotImageDimensions | null {
  if (!hasRiffWebpSignature(bytes)) return null;
  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  if (chunk === 'VP8X') {
    return {
      height: readUint24LittleEndian(bytes, 27) + 1,
      width: readUint24LittleEndian(bytes, 24) + 1,
    };
  }
  if (
    chunk === 'VP8 ' &&
    bytes.length >= 30 &&
    bytes[23] === 0x9d &&
    bytes[24] === 0x01 &&
    bytes[25] === 0x2a
  ) {
    return {
      height: readUint16LittleEndian(bytes, 28) & 0x3fff,
      width: readUint16LittleEndian(bytes, 26) & 0x3fff,
    };
  }
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    return {
      height: 1 + ((bytes[22]! >> 6) | (bytes[23]! << 2) | ((bytes[24]! & 0x0f) << 10)),
      width: 1 + bytes[21]! + ((bytes[22]! & 0x3f) << 8),
    };
  }
  return null;
}

function skipGifSubBlocks(bytes: Uint8Array, start: number): number | null {
  let offset = start;
  while (offset < bytes.length) {
    const size = bytes[offset]!;
    offset += 1;
    if (size === 0) return offset;
    if (offset + size > bytes.length) return null;
    offset += size;
  }
  return null;
}

function readGifDimensionCandidates(bytes: Uint8Array): WebSnapshotImageDimensions[] {
  const signature = String.fromCharCode(...bytes.slice(0, 6));
  if (bytes.length < 14 || (signature !== 'GIF87a' && signature !== 'GIF89a')) return [];
  const logicalScreen: WebSnapshotImageDimensions = {
    height: readUint16LittleEndian(bytes, 8),
    width: readUint16LittleEndian(bytes, 6),
  };
  let largestFrame: WebSnapshotImageDimensions | null = null;
  let maxBottom = 0;
  let maxRight = 0;
  const globalTableBytes = bytes[10]! & 0x80 ? 3 * 2 ** ((bytes[10]! & 0x07) + 1) : 0;
  let offset = 13 + globalTableBytes;
  while (offset < bytes.length) {
    const marker = bytes[offset]!;
    if (marker === 0x3b) {
      return [
        logicalScreen,
        ...(largestFrame ? [largestFrame] : []),
        ...(maxRight > 0 && maxBottom > 0 ? [{ height: maxBottom, width: maxRight }] : []),
      ];
    }
    if (marker === 0x21) {
      if (offset + 2 > bytes.length) return [];
      const next = skipGifSubBlocks(bytes, offset + 2);
      if (next === null) return [];
      offset = next;
      continue;
    }
    if (marker !== 0x2c || offset + 10 > bytes.length) return [];
    const left = readUint16LittleEndian(bytes, offset + 1);
    const top = readUint16LittleEndian(bytes, offset + 3);
    const width = readUint16LittleEndian(bytes, offset + 5);
    const height = readUint16LittleEndian(bytes, offset + 7);
    if (!largestFrame || width * height > largestFrame.width * largestFrame.height) {
      largestFrame = { height, width };
    }
    maxRight = Math.max(maxRight, left + width);
    maxBottom = Math.max(maxBottom, top + height);
    const packed = bytes[offset + 9]!;
    const localTableBytes = packed & 0x80 ? 3 * 2 ** ((packed & 0x07) + 1) : 0;
    offset += 10 + localTableBytes;
    if (offset >= bytes.length) return [];
    offset += 1;
    const next = skipGifSubBlocks(bytes, offset);
    if (next === null) return [];
    offset = next;
  }
  return [];
}

function readAvifDimensionCandidates(bytes: Uint8Array): WebSnapshotImageDimensions[] {
  const dimensions: WebSnapshotImageDimensions[] = [];
  const visitBoxes = (start: number, end: number): boolean => {
    let offset = start;
    while (offset + 8 <= end) {
      const size32 = readUint32BigEndian(bytes, offset);
      const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
      let headerBytes = 8;
      let size = size32;
      if (size32 === 1) {
        if (offset + 16 > end || readUint32BigEndian(bytes, offset + 8) !== 0) return false;
        size = readUint32BigEndian(bytes, offset + 12);
        headerBytes = 16;
      }
      const boxEnd = size === 0 ? end : offset + size;
      if (size < headerBytes || boxEnd > end || !Number.isSafeInteger(boxEnd)) return false;
      const payloadStart = offset + headerBytes;
      if (type === 'ispe') {
        if (payloadStart + 12 > boxEnd) return false;
        dimensions.push({
          height: readUint32BigEndian(bytes, payloadStart + 8),
          width: readUint32BigEndian(bytes, payloadStart + 4),
        });
      } else if (type === 'meta') {
        if (payloadStart + 4 > boxEnd || !visitBoxes(payloadStart + 4, boxEnd)) return false;
      } else if ((type === 'iprp' || type === 'ipco') && !visitBoxes(payloadStart, boxEnd)) {
        return false;
      }
      offset = boxEnd;
    }
    return offset === end;
  };
  return visitBoxes(0, bytes.length) ? dimensions : [];
}

export function readWebSnapshotEncodedImageDimensionCandidates(
  bytes: Uint8Array,
  mimeType: string
): WebSnapshotImageDimensions[] {
  if (mimeType === 'image/gif') return readGifDimensionCandidates(bytes);
  if (mimeType === 'image/avif') return readAvifDimensionCandidates(bytes);
  const single =
    mimeType === 'image/png'
      ? readPngDimensions(bytes)
      : mimeType === 'image/jpeg'
        ? readJpegDimensions(bytes)
        : mimeType === 'image/webp'
          ? readWebpDimensions(bytes)
          : null;
  if (single) return [single];
  return [];
}

function readWebSnapshotEncodedImageDimensions(
  bytes: Uint8Array,
  mimeType: string
): WebSnapshotImageDimensions | null {
  return readWebSnapshotEncodedImageDimensionCandidates(bytes, mimeType)[0] ?? null;
}

export function assertWebSnapshotImageDimensionsWithinLimits(
  dimensions: WebSnapshotImageDimensions,
  message = 'Web snapshot screenshot dimensions exceed safe limits.'
): void {
  if (
    !Number.isInteger(dimensions.width) ||
    !Number.isInteger(dimensions.height) ||
    dimensions.width <= 0 ||
    dimensions.height <= 0 ||
    dimensions.width > MAX_WEB_SNAPSHOT_SCREENSHOT_SIDE_PX ||
    dimensions.height > MAX_WEB_SNAPSHOT_SCREENSHOT_SIDE_PX ||
    dimensions.width * dimensions.height > MAX_WEB_SNAPSHOT_SCREENSHOT_AREA_PX
  ) {
    throw new Error(message);
  }
}

export async function validateWebSnapshotScreenshotBlob(
  blob: Blob
): Promise<WebSnapshotImageDimensions> {
  if (blob.size === 0) throw new Error('Web snapshot screenshot is missing.');
  if (blob.size > MAX_WEB_SNAPSHOT_SCREENSHOT_BYTES) {
    throw new Error('Web snapshot screenshot is too large.');
  }
  if (!WEB_SNAPSHOT_SCREENSHOT_MIME_TYPES.has(blob.type)) {
    throw new Error('Web snapshot screenshot MIME type is not supported.');
  }

  const header = new Uint8Array(
    await blob.slice(0, Math.min(blob.size, MAX_IMAGE_HEADER_BYTES)).arrayBuffer()
  );
  const headerDimensions = readWebSnapshotEncodedImageDimensions(header, blob.type);
  if (!headerDimensions) throw new Error('Web snapshot screenshot is invalid.');
  assertWebSnapshotImageDimensionsWithinLimits(headerDimensions);

  let decodedDimensions: WebSnapshotImageDimensions;
  try {
    decodedDimensions = await measureImageBlob(blob);
  } catch {
    throw new Error('Web snapshot screenshot is invalid.');
  }
  assertWebSnapshotImageDimensionsWithinLimits(decodedDimensions);
  if (
    decodedDimensions.width !== headerDimensions.width ||
    decodedDimensions.height !== headerDimensions.height
  ) {
    throw new Error('Web snapshot screenshot dimensions are invalid.');
  }
  return decodedDimensions;
}

export async function validateRetainedWebSnapshotScreenshot(args: {
  packageBytes: Uint8Array;
  screenshotBlob: Blob;
}): Promise<WebSnapshotImageDimensions> {
  const dimensions = await validateWebSnapshotScreenshotBlob(args.screenshotBlob);
  if (args.packageBytes.byteLength !== args.screenshotBlob.size) {
    throw new Error('Web snapshot retained screenshot does not match the package.');
  }
  const retainedBytes = new Uint8Array(await args.screenshotBlob.arrayBuffer());
  if (!args.packageBytes.every((byte, index) => byte === retainedBytes[index])) {
    throw new Error('Web snapshot retained screenshot does not match the package.');
  }
  return dimensions;
}
