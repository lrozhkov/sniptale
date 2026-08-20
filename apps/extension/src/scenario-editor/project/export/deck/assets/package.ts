import type { ArchiveWriter } from '../../../../../composition/archive-transfer';
import type { ScenarioDeckExportAssets } from '../types';

export async function addScenarioDeckAssetFiles(
  archive: ArchiveWriter,
  assets: ScenarioDeckExportAssets
): Promise<void> {
  for (const asset of assets.assetsById.values()) {
    await archive.addBlob(asset.filename, asset.blob);
  }
}
