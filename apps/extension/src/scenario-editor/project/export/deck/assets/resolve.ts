import type { ScenarioSlideRenderAsset } from '../../../stage-render/slide';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import type {
  ScenarioDeckAssetMode,
  ScenarioDeckExportAsset,
  ScenarioDeckExportAssets,
} from '../types';
import { collectScenarioDeckAssetIds } from './collect';
import { blobToScenarioDeckDataUrl } from './data-url';
import { createScenarioDeckAssetFilename } from './filename';

export async function resolveScenarioDeckExportAssets(args: {
  assetMode: ScenarioDeckAssetMode;
  getAssetBlob: (assetId: string) => Promise<Blob | undefined>;
  project: ScenarioProjectV3;
}): Promise<ScenarioDeckExportAssets> {
  const assetsById = new Map<string, ScenarioDeckExportAsset>();
  const renderAssets: Record<string, ScenarioSlideRenderAsset> = {};
  const missingAssetIds: string[] = [];
  const assetIds = collectScenarioDeckAssetIds(args.project);

  for (const [index, assetId] of assetIds.entries()) {
    const blob = await args.getAssetBlob(assetId);
    if (!blob) {
      missingAssetIds.push(assetId);
      continue;
    }

    const filename = createScenarioDeckAssetFilename({ assetId, blob, index });
    const source = args.assetMode === 'embed' ? await blobToScenarioDeckDataUrl(blob) : filename;
    assetsById.set(assetId, { assetId, blob, filename, source });
    renderAssets[assetId] = { height: null, source, width: null };
  }

  return { assetsById, missingAssetIds, renderAssets };
}
