const SCENARIO_ASSET_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const SCENARIO_ASSET_MAX_IMAGE_BYTES = 64 * 1024 * 1024;

function normalizeScenarioAssetMimeType(mimeType: string): string {
  return mimeType.toLowerCase().split(';', 1)[0]?.trim() ?? '';
}

export function isSafeScenarioAssetImageMimeType(mimeType: string): boolean {
  return SCENARIO_ASSET_IMAGE_MIME_TYPES.has(normalizeScenarioAssetMimeType(mimeType));
}

export function assertSafeScenarioAssetStorageInput(blob: Blob, mimeType: string): void {
  if (!isSafeScenarioAssetImageMimeType(mimeType)) {
    throw new Error('Unsupported scenario asset MIME type.');
  }

  if (blob.size <= 0 || blob.size > SCENARIO_ASSET_MAX_IMAGE_BYTES) {
    throw new Error('Scenario asset exceeds storage size limit.');
  }
}
