import type { PreparedAssetObject } from '../../assets';

export function createPreparedRecordingAssetForTest(
  file: Blob,
  assetId = 'asset-test'
): PreparedAssetObject {
  return {
    ref: {
      assetId,
      createdAt: 1,
      location: { kind: 'opfs', objectKey: `objects/${assetId}` },
      mimeType: file.type || 'video/webm',
      sha256: null,
      size: file.size,
    },
  };
}
