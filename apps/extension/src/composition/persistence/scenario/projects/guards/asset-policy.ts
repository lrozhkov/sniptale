const SCENARIO_ASSET_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const SCENARIO_ASSET_AUDIO_MIME_TYPES = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
]);
const SCENARIO_ASSET_MAX_AUDIO_BYTES = 256 * 1024 * 1024;

const SCENARIO_ASSET_MAX_IMAGE_BYTES = 64 * 1024 * 1024;

function normalizeScenarioAssetMimeType(mimeType: string): string {
  return mimeType.toLowerCase().split(';', 1)[0]?.trim() ?? '';
}

export function isSafeScenarioAssetImageMimeType(mimeType: string): boolean {
  return SCENARIO_ASSET_IMAGE_MIME_TYPES.has(normalizeScenarioAssetMimeType(mimeType));
}

/** Admitted encoded audio only; decoding belongs to the media acquisition owner. */
export function isSafeScenarioAssetAudioMimeType(mimeType: string): boolean {
  return SCENARIO_ASSET_AUDIO_MIME_TYPES.has(normalizeScenarioAssetMimeType(mimeType));
}

export function assertSafeScenarioAssetStorageInput(blob: Blob, mimeType: string): void {
  assertSafeScenarioAssetStorageMetadata(blob.size, mimeType);
}

export function assertSafeScenarioAssetStorageMetadata(size: number, mimeType: string): void {
  const audio = isSafeScenarioAssetAudioMimeType(mimeType);
  if (!audio && !isSafeScenarioAssetImageMimeType(mimeType)) {
    throw new Error('Unsupported scenario asset MIME type.');
  }

  if (
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > (audio ? SCENARIO_ASSET_MAX_AUDIO_BYTES : SCENARIO_ASSET_MAX_IMAGE_BYTES)
  ) {
    throw new Error('Scenario asset exceeds storage size limit.');
  }
}
