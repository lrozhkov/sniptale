import type { PageStylePatch } from '@sniptale/runtime-contracts/page-style';
import { translate } from '../../../../platform/i18n';
import { cleanupPageStyleAssetsIfUnreferenced } from '../../../../composition/persistence/page-style';
import type { PageStyleInspectorActionOutcome } from '../types';
import { PageStyleAssetCleanupError } from '../action-errors';

export async function cleanupRemovedDraftAssets(
  previousPatch: PageStylePatch,
  nextPatch: PageStylePatch
): Promise<PageStyleInspectorActionOutcome> {
  const removedAssetIds = collectRemovedPatchAssetIds(previousPatch, nextPatch);
  if (removedAssetIds.length === 0) {
    return undefined;
  }

  const result = await cleanupPageStyleAssetsIfUnreferenced(removedAssetIds);
  if (result.cleanupFailedAssetIds.length > 0) {
    return {
      message: translate('content.pageStyleInspector.templateCleanupWarning'),
      state: 'warning',
    };
  }

  return undefined;
}

export async function cleanupUnsavedDraftAsset(assetId: string): Promise<void> {
  const result = await cleanupPageStyleAssetsIfUnreferenced([assetId]);
  if (result.cleanupFailedAssetIds.length > 0) {
    throw new PageStyleAssetCleanupError(result.cleanupFailedAssetIds);
  }
}

function collectRemovedPatchAssetIds(previousPatch: PageStylePatch, nextPatch: PageStylePatch) {
  const nextAssetIds = new Set(nextPatch.assets.map((asset) => asset.assetId));
  return previousPatch.assets
    .map((asset) => asset.assetId)
    .filter((assetId) => !nextAssetIds.has(assetId));
}
