import type {
  PageStyleCurrentPageRuleSummary,
  PageStyleRegistry,
  PageStyleRestoreRule,
  PageStyleScope,
  PageStyleTemplate,
} from '@sniptale/runtime-contracts/page-style';
import { assertPageStyleRegistryWithinLimits } from '@sniptale/runtime-contracts/page-style/limits';
import { browserStorage } from '../../infrastructure/browser-storage';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  cleanupPageStyleAssetReferences,
  deleteRestoreRuleAndCleanupAssets,
  deleteTemplateAndCleanupAssets,
  type DeletePageStyleRestoreRuleResult,
  type DeletePageStyleTemplateResult,
  type PageStyleAssetCleanupResult,
} from './cleanup';
import { createEmptyPageStyleRegistry, parseStoredPageStyleRegistry } from './guards';
import { cloneRegistry, cloneRestoreRule, cloneTemplate } from './clone';
import { saveRestoreRuleRecord, updateRestoreRuleScope } from './restore-rule-save';
import { saveRestoreRuleWithAssetCleanup } from './restore-rule-asset-cleanup';
import { createCurrentPageRuleSummary } from './summary';
import { saveTemplateWithAssetCleanup } from './template-asset-cleanup';
import { saveTemplateRecord } from './template-save';
import type {
  PageStylePageIdentity,
  SavePageStyleRestoreRuleInput,
  SavePageStyleTemplateInput,
} from './types';
import { createStorageWriteQueue } from '../../infrastructure/write-queue';

export const PAGE_STYLE_STORAGE_KEY = 'sniptale_page_style_registry';

const logger = createLogger({ namespace: 'SharedPageStyleStorage' });
const enqueueWrite = createStorageWriteQueue();

export type { PageStylePageIdentity, SavePageStyleRestoreRuleInput, SavePageStyleTemplateInput };
export type { DeletePageStyleRestoreRuleResult, DeletePageStyleTemplateResult };

export type DeletePageStyleAssetPort = (assetId: string) => Promise<void>;

function createId(): string {
  return crypto.randomUUID();
}

function warnAboutInvalidPayload(hasInvalidRoot: boolean, invalidEntryCount: number): void {
  if (hasInvalidRoot) {
    logger.warn('Ignoring invalid page style registry payload root from storage');
  }

  if (invalidEntryCount > 0) {
    logger.warn('Dropped invalid page style registry entries from storage', {
      invalidEntryCount,
    });
  }
}

async function writeRegistry(registry: PageStyleRegistry): Promise<void> {
  assertPageStyleRegistryWithinLimits(registry);
  const persisted = cloneRegistry(registry);
  await browserStorage.local.set({ [PAGE_STYLE_STORAGE_KEY]: persisted });
  logger.debug('Saved page style registry');
}

export async function loadPageStyleRegistry(): Promise<PageStyleRegistry> {
  const result = await browserStorage.local.get([PAGE_STYLE_STORAGE_KEY]);
  const parsed = parseStoredPageStyleRegistry(result[PAGE_STYLE_STORAGE_KEY]);
  warnAboutInvalidPayload(parsed.hasInvalidRoot, parsed.invalidEntryCount);
  return cloneRegistry(parsed.value);
}

export async function listPageStyleTemplates(): Promise<PageStyleTemplate[]> {
  return (await loadPageStyleRegistry()).templates.map(cloneTemplate);
}

export async function listPageStyleRestoreRules(): Promise<PageStyleRestoreRule[]> {
  return (await loadPageStyleRegistry()).restoreRules.map(cloneRestoreRule);
}

export async function savePageStyleTemplate(
  input: SavePageStyleTemplateInput
): Promise<PageStyleTemplate> {
  return enqueueWrite(async () =>
    saveTemplateRecord({
      createId,
      input,
      now: Date.now(),
      loadRegistry: loadPageStyleRegistry,
      writeRegistry,
    })
  );
}

export async function savePageStyleTemplateWithAssetCleanup(
  input: SavePageStyleTemplateInput,
  deps: { deleteAsset: DeletePageStyleAssetPort }
): ReturnType<typeof saveTemplateWithAssetCleanup> {
  return enqueueWrite(async () => {
    return await saveTemplateWithAssetCleanup({
      createId,
      deleteAsset: deps.deleteAsset,
      input,
      now: Date.now(),
      loadRegistry: loadPageStyleRegistry,
      writeRegistry,
    });
  });
}

export async function deletePageStyleTemplate(templateId: string): Promise<boolean> {
  return enqueueWrite(async () => {
    const registry = await loadPageStyleRegistry();
    if (!registry.templates.some((template) => template.id === templateId)) {
      return false;
    }

    await writeRegistry({
      ...registry,
      templates: registry.templates.filter((template) => template.id !== templateId),
    });
    return true;
  });
}

export async function deletePageStyleTemplateWithAssetCleanup(
  templateId: string,
  deps: { deleteAsset: DeletePageStyleAssetPort }
): Promise<DeletePageStyleTemplateResult> {
  return enqueueWrite(async () =>
    deleteTemplateAndCleanupAssets({
      deleteAsset: deps.deleteAsset,
      loadRegistry: loadPageStyleRegistry,
      templateId,
      writeRegistry,
    })
  );
}

export async function cleanupPageStyleAssetsIfUnreferenced(
  assetIds: Iterable<string>,
  deps: { deleteAsset: DeletePageStyleAssetPort }
): Promise<PageStyleAssetCleanupResult> {
  return enqueueWrite(async () =>
    cleanupPageStyleAssetReferences({
      assetIds,
      deleteAsset: deps.deleteAsset,
      loadRegistry: loadPageStyleRegistry,
    })
  );
}

export async function savePageStyleRestoreRule(
  input: SavePageStyleRestoreRuleInput
): Promise<PageStyleRestoreRule> {
  return enqueueWrite(async () =>
    saveRestoreRuleRecord({
      allowUpdate: false,
      createId,
      input,
      now: Date.now(),
      loadRegistry: loadPageStyleRegistry,
      writeRegistry,
    })
  );
}

export async function savePageStyleRestoreRuleWithAssetCleanup(
  input: SavePageStyleRestoreRuleInput,
  deps: { deleteAsset: DeletePageStyleAssetPort }
): ReturnType<typeof saveRestoreRuleWithAssetCleanup> {
  return enqueueWrite(async () =>
    saveRestoreRuleWithAssetCleanup({
      createId,
      deleteAsset: deps.deleteAsset,
      input,
      now: Date.now(),
      loadRegistry: loadPageStyleRegistry,
      writeRegistry,
    })
  );
}

export async function deletePageStyleRestoreRule(ruleId: string): Promise<boolean> {
  return enqueueWrite(async () => {
    const registry = await loadPageStyleRegistry();
    if (!registry.restoreRules.some((rule) => rule.id === ruleId)) {
      return false;
    }

    await writeRegistry({
      ...registry,
      restoreRules: registry.restoreRules.filter((rule) => rule.id !== ruleId),
    });
    return true;
  });
}

export async function deletePageStyleRestoreRuleWithAssetCleanup(
  ruleId: string,
  deps: { deleteAsset: DeletePageStyleAssetPort }
): Promise<DeletePageStyleRestoreRuleResult> {
  return enqueueWrite(async () =>
    deleteRestoreRuleAndCleanupAssets({
      deleteAsset: deps.deleteAsset,
      loadRegistry: loadPageStyleRegistry,
      ruleId,
      writeRegistry,
    })
  );
}

export async function setPageStyleRestoreRuleEnabled(
  ruleId: string,
  enabled: boolean
): Promise<boolean> {
  return enqueueWrite(async () => {
    const registry = await loadPageStyleRegistry();
    let changed = false;
    const now = Date.now();
    const nextRules = registry.restoreRules.map((rule) => {
      if (rule.id !== ruleId || rule.enabled === enabled) {
        return rule;
      }

      changed = true;
      return { ...rule, enabled, updatedAt: now };
    });

    if (!changed) {
      return false;
    }

    await writeRegistry({ ...registry, restoreRules: nextRules });
    return true;
  });
}

export async function updatePageStyleRestoreRuleScope(
  ruleId: string,
  scope: PageStyleScope
): Promise<PageStyleRestoreRule | null> {
  return enqueueWrite(async () =>
    updateRestoreRuleScope({
      scope,
      ruleId,
      now: Date.now(),
      loadRegistry: loadPageStyleRegistry,
      writeRegistry,
    })
  );
}

export async function summarizePageStyleRulesForPage(
  page: PageStylePageIdentity
): Promise<PageStyleCurrentPageRuleSummary> {
  return createCurrentPageRuleSummary(await loadPageStyleRegistry(), page);
}

export { createEmptyPageStyleRegistry, parseStoredPageStyleRegistry };
