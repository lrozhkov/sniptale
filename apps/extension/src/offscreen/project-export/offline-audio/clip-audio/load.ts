import { getAssetById } from '../../../../features/video/project/timeline/basics';
import { loadBlobForSource } from '../../media-loading/blob';

export async function loadBlobForAsset(
  project: Parameters<typeof getAssetById>[0],
  assetId: string
): Promise<Blob> {
  const asset = getAssetById(project, assetId);
  if (!asset) {
    throw new Error(`Asset ${assetId} not found for offline audio mix.`);
  }

  return loadBlobForSource(asset.source);
}
