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
  const maxBytes = getProjectAssetMaxBytes(mimeType);

  if (maxBytes === null) {
    throw new Error('Unsupported project asset MIME type.');
  }

  if (blob.size <= 0 || blob.size > maxBytes) {
    throw new Error('Project asset exceeds storage size limit.');
  }
}
