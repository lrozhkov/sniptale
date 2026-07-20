import type {
  PageStyleAssetReference,
  PageStylePatch,
  PageStyleRegistry,
  PageStyleRestoreRule,
} from '@sniptale/runtime-contracts/page-style';
import { cloneRestoreRule } from './clone';
import { cleanupPageStyleAssetReferences, type PageStyleAssetCleanupResult } from './cleanup';
import { createRestoreRuleRegistryUpdate } from './restore-rule-save';
import type { SavePageStyleRestoreRuleInput } from './types';

type DeletePageStyleAssetPort = (assetId: string) => Promise<void>;
type SaveRestoreRuleWithAssetCleanupResult = PageStyleAssetCleanupResult & {
  rule: PageStyleRestoreRule;
};

export async function saveRestoreRuleWithAssetCleanup(args: {
  createId: () => string;
  deleteAsset: DeletePageStyleAssetPort;
  input: SavePageStyleRestoreRuleInput;
  loadRegistry: () => Promise<PageStyleRegistry>;
  now: number;
  writeRegistry: (registry: PageStyleRegistry) => Promise<void>;
}): Promise<SaveRestoreRuleWithAssetCleanupResult> {
  const update = createRestoreRuleRegistryUpdate({
    createId: args.createId,
    input: args.input,
    now: args.now,
    registry: await args.loadRegistry(),
  });
  const removedAssetIds = collectRemovedRestoreRuleAssetIds(update.existing, update.rule);

  await args.writeRegistry(update.nextRegistry);
  const cleanupResult = await cleanupPageStyleAssetReferences({
    assetIds: removedAssetIds,
    deleteAsset: args.deleteAsset,
    loadRegistry: args.loadRegistry,
  });

  return { ...cleanupResult, rule: cloneRestoreRule(update.rule) };
}

function collectRemovedRestoreRuleAssetIds(
  previous: PageStyleRestoreRule | undefined,
  next: PageStyleRestoreRule
): Set<string> {
  if (!previous) {
    return new Set();
  }

  const nextAssetIds = collectRestoreRuleAssetIds(next);
  return new Set(
    [...collectRestoreRuleAssetIds(previous)].filter((assetId) => !nextAssetIds.has(assetId))
  );
}

function collectRestoreRuleAssetIds(rule: PageStyleRestoreRule): Set<string> {
  const assetIds = new Set<string>();
  addPatchAssetIds(rule.patch, assetIds);
  addAssetReference(rule.contentRetention?.image?.asset, assetIds);
  return assetIds;
}

function addPatchAssetIds(patch: PageStylePatch, assetIds: Set<string>): void {
  for (const asset of patch.assets) {
    addAssetReference(asset, assetIds);
  }
}

function addAssetReference(
  asset: PageStyleAssetReference | undefined,
  assetIds: Set<string>
): void {
  if (asset) {
    assetIds.add(asset.assetId);
  }
}
