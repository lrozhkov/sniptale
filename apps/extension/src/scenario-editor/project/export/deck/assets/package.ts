import type JSZip from 'jszip';
import type { ScenarioDeckExportAssets } from '../types';

export async function addScenarioDeckAssetFiles(
  zip: JSZip,
  assets: ScenarioDeckExportAssets
): Promise<void> {
  for (const asset of assets.assetsById.values()) {
    zip.file(asset.filename, await asset.blob.arrayBuffer());
  }
}
