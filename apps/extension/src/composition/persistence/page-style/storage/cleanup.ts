import type {
  PageStylePatch,
  PageStyleRegistry,
  PageStyleRestoreRule,
  PageStyleTemplate,
} from '@sniptale/runtime-contracts/page-style';
import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'SharedPageStyleStorageCleanup' });

export type DeletePageStyleRestoreRuleResult = {
  cleanupFailedAssetIds: string[];
  deleted: boolean;
};

export type DeletePageStyleTemplateResult = {
  cleanupFailedAssetIds: string[];
  deleted: boolean;
};

export type PageStyleAssetCleanupResult = {
  cleanupFailedAssetIds: string[];
};

interface DeleteRestoreRuleCleanupDeps {
  deleteAsset: (assetId: string) => Promise<void>;
  loadRegistry: () => Promise<PageStyleRegistry>;
  ruleId: string;
  writeRegistry: (registry: PageStyleRegistry) => Promise<void>;
}

interface DeleteTemplateCleanupDeps {
  deleteAsset: (assetId: string) => Promise<void>;
  loadRegistry: () => Promise<PageStyleRegistry>;
  templateId: string;
  writeRegistry: (registry: PageStyleRegistry) => Promise<void>;
}

interface CleanupAssetReferencesDeps {
  assetIds: Iterable<string>;
  deleteAsset: (assetId: string) => Promise<void>;
  loadRegistry: () => Promise<PageStyleRegistry>;
}

function addPatchAssetIds(patch: PageStylePatch, assetIds: Set<string>): void {
  for (const asset of patch.assets) {
    assetIds.add(asset.assetId);
  }
}

function addRuleAssetIds(rule: PageStyleRestoreRule, assetIds: Set<string>): void {
  addPatchAssetIds(rule.patch, assetIds);

  if (rule.contentRetention?.image) {
    assetIds.add(rule.contentRetention.image.asset.assetId);
  }
}

function addTemplateAssetIds(template: PageStyleTemplate, assetIds: Set<string>): void {
  addPatchAssetIds(template.patch, assetIds);
}

function collectUnreferencedAssetIds(
  removedAssetIds: Set<string>,
  registry: PageStyleRegistry
): string[] {
  if (removedAssetIds.size === 0) {
    return [];
  }

  const retainedAssetIds = new Set<string>();
  for (const rule of registry.restoreRules) {
    addRuleAssetIds(rule, retainedAssetIds);
  }
  for (const template of registry.templates) {
    addTemplateAssetIds(template, retainedAssetIds);
  }

  return [...removedAssetIds].filter((assetId) => !retainedAssetIds.has(assetId));
}

async function cleanupUnreferencedPageStyleAssets(
  removedAssetIds: Set<string>,
  latestRegistry: PageStyleRegistry,
  deleteAsset: (assetId: string) => Promise<void>
): Promise<string[]> {
  const cleanupFailedAssetIds: string[] = [];

  for (const assetId of collectUnreferencedAssetIds(removedAssetIds, latestRegistry)) {
    try {
      await deleteAsset(assetId);
    } catch (error) {
      cleanupFailedAssetIds.push(assetId);
      logger.warn('Failed to delete unreferenced page style asset', { assetId, error });
    }
  }

  return cleanupFailedAssetIds;
}

export async function cleanupPageStyleAssetReferences(
  deps: CleanupAssetReferencesDeps
): Promise<PageStyleAssetCleanupResult> {
  const removedAssetIds = new Set(deps.assetIds);
  const latestRegistry = await deps.loadRegistry();

  return {
    cleanupFailedAssetIds: await cleanupUnreferencedPageStyleAssets(
      removedAssetIds,
      latestRegistry,
      deps.deleteAsset
    ),
  };
}

export async function deleteRestoreRuleAndCleanupAssets(
  deps: DeleteRestoreRuleCleanupDeps
): Promise<DeletePageStyleRestoreRuleResult> {
  const registry = await deps.loadRegistry();
  const removedRule = registry.restoreRules.find((rule) => rule.id === deps.ruleId);

  if (!removedRule) {
    return { cleanupFailedAssetIds: [], deleted: false };
  }

  const nextRegistry = {
    ...registry,
    restoreRules: registry.restoreRules.filter((rule) => rule.id !== deps.ruleId),
  };
  const removedAssetIds = new Set<string>();
  addRuleAssetIds(removedRule, removedAssetIds);

  await deps.writeRegistry(nextRegistry);
  const latestRegistry = await deps.loadRegistry();
  return {
    cleanupFailedAssetIds: await cleanupUnreferencedPageStyleAssets(
      removedAssetIds,
      latestRegistry,
      deps.deleteAsset
    ),
    deleted: true,
  };
}

export async function deleteTemplateAndCleanupAssets(
  deps: DeleteTemplateCleanupDeps
): Promise<DeletePageStyleTemplateResult> {
  const registry = await deps.loadRegistry();
  const removedTemplate = registry.templates.find((template) => template.id === deps.templateId);

  if (!removedTemplate) {
    return { cleanupFailedAssetIds: [], deleted: false };
  }

  const nextRegistry = {
    ...registry,
    templates: registry.templates.filter((template) => template.id !== deps.templateId),
  };
  const removedAssetIds = new Set<string>();
  addTemplateAssetIds(removedTemplate, removedAssetIds);

  await deps.writeRegistry(nextRegistry);
  const latestRegistry = await deps.loadRegistry();
  return {
    cleanupFailedAssetIds: await cleanupUnreferencedPageStyleAssets(
      removedAssetIds,
      latestRegistry,
      deps.deleteAsset
    ),
    deleted: true,
  };
}
