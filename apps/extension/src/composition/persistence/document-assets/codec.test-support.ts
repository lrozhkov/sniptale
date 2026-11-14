import { beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  nextId: 0,
  readAssetFile: vi.fn(),
  writeBlobToAsset: vi.fn(),
  discardPreparedAsset: vi.fn(async (_assetId: string) => undefined),
}));

vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets')>()),
  discardPreparedAsset: mocks.discardPreparedAsset,
  collectPreparedAssetCleanupFailures: async (assetIds: readonly string[]) => {
    const results = await Promise.allSettled(
      assetIds.map((assetId) => mocks.discardPreparedAsset(assetId))
    );
    return results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason as unknown] : []
    );
  },
  readAssetFile: mocks.readAssetFile,
  writeBlobToAsset: mocks.writeBlobToAsset,
}));

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: vi.fn(async (blob: Blob) => `data:${blob.type};base64,${btoa(await blob.text())}`),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.nextId = 0;
  mocks.discardPreparedAsset.mockReset().mockResolvedValue(undefined);
  mocks.writeBlobToAsset.mockImplementation(async (blob: Blob) => {
    const assetId = `asset-${++mocks.nextId}`;
    return {
      ref: {
        assetId,
        createdAt: 1,
        location: { kind: 'opfs', objectKey: `objects/${assetId}` },
        mimeType: blob.type,
        sha256: null,
        size: blob.size,
      },
    };
  });
});

export function getDocumentAssetCodecMocks() {
  return mocks;
}
