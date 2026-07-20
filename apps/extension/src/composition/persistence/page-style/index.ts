import { deletePageStyleAsset } from './assets';
import {
  cleanupPageStyleAssetsIfUnreferenced as cleanupStoredPageStyleAssetsIfUnreferenced,
  deletePageStyleRestoreRuleWithAssetCleanup,
  deletePageStyleTemplateWithAssetCleanup,
  savePageStyleRestoreRuleWithAssetCleanup,
  savePageStyleTemplateWithAssetCleanup,
  type DeletePageStyleRestoreRuleResult,
  type DeletePageStyleTemplateResult,
  type SavePageStyleRestoreRuleInput,
  type SavePageStyleTemplateInput,
} from './storage';

export type { DeletePageStyleRestoreRuleResult, DeletePageStyleTemplateResult };

export async function savePageStyleTemplateAndCleanupAssets(input: SavePageStyleTemplateInput) {
  return await savePageStyleTemplateWithAssetCleanup(input, {
    deleteAsset: deletePageStyleAsset,
  });
}

export async function cleanupPageStyleAssetsIfUnreferenced(assetIds: Iterable<string>) {
  return await cleanupStoredPageStyleAssetsIfUnreferenced(assetIds, {
    deleteAsset: deletePageStyleAsset,
  });
}

export async function savePageStyleRestoreRuleAndCleanupAssets(
  input: SavePageStyleRestoreRuleInput
) {
  return await savePageStyleRestoreRuleWithAssetCleanup(input, {
    deleteAsset: deletePageStyleAsset,
  });
}

export async function deletePageStyleTemplateAndCleanupAssets(
  templateId: string
): Promise<DeletePageStyleTemplateResult> {
  return await deletePageStyleTemplateWithAssetCleanup(templateId, {
    deleteAsset: deletePageStyleAsset,
  });
}

export async function deletePageStyleTemplate(templateId: string): Promise<boolean> {
  return (await deletePageStyleTemplateAndCleanupAssets(templateId)).deleted;
}

export async function deletePageStyleRestoreRuleAndCleanupAssets(
  ruleId: string
): Promise<DeletePageStyleRestoreRuleResult> {
  return await deletePageStyleRestoreRuleWithAssetCleanup(ruleId, {
    deleteAsset: deletePageStyleAsset,
  });
}

export async function deletePageStyleRestoreRule(ruleId: string): Promise<boolean> {
  return (await deletePageStyleRestoreRuleAndCleanupAssets(ruleId)).deleted;
}
