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

type ImageDimensions = { height: number; width: number };

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

function readPngDimensions(bytes: Uint8Array): ImageDimensions | null {
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

function readJpegDimensions(bytes: Uint8Array): ImageDimensions | null {
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

function readWebpDimensions(bytes: Uint8Array): ImageDimensions | null {
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

function readScreenshotDimensions(bytes: Uint8Array, mimeType: string): ImageDimensions | null {
  if (mimeType === 'image/png') return readPngDimensions(bytes);
  if (mimeType === 'image/jpeg') return readJpegDimensions(bytes);
  if (mimeType === 'image/webp') return readWebpDimensions(bytes);
  return null;
}

function assertDimensionsWithinProfile(dimensions: ImageDimensions): void {
  if (
    !Number.isInteger(dimensions.width) ||
    !Number.isInteger(dimensions.height) ||
    dimensions.width <= 0 ||
    dimensions.height <= 0 ||
    dimensions.width > MAX_WEB_SNAPSHOT_SCREENSHOT_SIDE_PX ||
    dimensions.height > MAX_WEB_SNAPSHOT_SCREENSHOT_SIDE_PX ||
    dimensions.width * dimensions.height > MAX_WEB_SNAPSHOT_SCREENSHOT_AREA_PX
  ) {
    throw new Error('Web snapshot screenshot dimensions exceed safe limits.');
  }
}

export async function validateWebSnapshotScreenshotBlob(blob: Blob): Promise<ImageDimensions> {
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
  const headerDimensions = readScreenshotDimensions(header, blob.type);
  if (!headerDimensions) throw new Error('Web snapshot screenshot is invalid.');
  assertDimensionsWithinProfile(headerDimensions);

  let decodedDimensions: ImageDimensions;
  try {
    decodedDimensions = await measureImageBlob(blob);
  } catch {
    throw new Error('Web snapshot screenshot is invalid.');
  }
  assertDimensionsWithinProfile(decodedDimensions);
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
}): Promise<ImageDimensions> {
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
