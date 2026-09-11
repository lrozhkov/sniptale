export const PROJECT_ASSET_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
] as const;
export const PROJECT_ASSET_VIDEO_MIME_TYPES = [
  'video/webm',
  'video/mp4',
  'video/quicktime',
] as const;
export const PROJECT_ASSET_AUDIO_MIME_TYPES = [
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/mpeg',
  'audio/flac',
  'audio/x-flac',
] as const;

const PROJECT_ASSET_MAX_IMAGE_BYTES = 64 * 1024 * 1024;
const PROJECT_ASSET_MAX_AUDIO_BYTES = 192 * 1024 * 1024;
const PROJECT_ASSET_MAX_VIDEO_BYTES = 512 * 1024 * 1024;

const PROJECT_ASSET_MIME_PROFILES = [
  {
    maxBytes: PROJECT_ASSET_MAX_IMAGE_BYTES,
    mimeTypes: PROJECT_ASSET_IMAGE_MIME_TYPES,
  },
  {
    maxBytes: PROJECT_ASSET_MAX_AUDIO_BYTES,
    mimeTypes: PROJECT_ASSET_AUDIO_MIME_TYPES,
  },
  {
    maxBytes: PROJECT_ASSET_MAX_VIDEO_BYTES,
    mimeTypes: PROJECT_ASSET_VIDEO_MIME_TYPES,
  },
] as const;

function normalizeMimeType(mimeType: string): string {
  return mimeType.toLowerCase().split(';', 1)[0]?.trim() ?? '';
}

function getProjectAssetMaxBytes(mimeType: string): number | null {
  const normalizedMimeType = normalizeMimeType(mimeType);

  for (const profile of PROJECT_ASSET_MIME_PROFILES) {
    if (profile.mimeTypes.some((profileMimeType) => profileMimeType === normalizedMimeType)) {
      return profile.maxBytes;
    }
  }

  return null;
}

export function assertSafeProjectAssetStorageInput(blob: Blob, mimeType: string): void {
  assertSafeProjectAssetStorageMetadata(blob.size, mimeType);
}

function assertSafeProjectAssetStorageMetadata(size: number, mimeType: string): void {
  const maxBytes = getProjectAssetMaxBytes(mimeType);

  if (maxBytes === null) {
    throw new Error('Unsupported project asset MIME type.');
  }

  if (!Number.isSafeInteger(size) || size <= 0 || size > maxBytes) {
    throw new Error('Project asset exceeds storage size limit.');
  }
}

/** Admits a raster by the shared image MIME/size policy and its file signature before decoding. */
export async function assertImportableProjectImage(blob: Blob): Promise<void> {
  const mime = normalizeMimeType(blob.type);
  if (!PROJECT_ASSET_IMAGE_MIME_TYPES.some((allowed) => allowed === mime) || blob.size === 0) {
    throw new Error('Unsupported image input.');
  }
  assertSafeProjectAssetStorageInput(blob, mime);
  const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const ascii = (offset: number, value: string) =>
    [...value].every((char, index) => bytes[offset + index] === char.charCodeAt(0));
  const matches =
    (mime === 'image/png' &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) ||
    (mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
    (mime === 'image/gif' && (ascii(0, 'GIF87a') || ascii(0, 'GIF89a'))) ||
    (mime === 'image/webp' && ascii(0, 'RIFF') && ascii(8, 'WEBP')) ||
    (mime === 'image/avif' && ascii(4, 'ftyp') && (ascii(8, 'avif') || ascii(8, 'avis')));
  if (!matches) throw new Error('Image signature does not match its MIME type.');
}
