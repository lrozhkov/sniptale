import type {
  PageStyleRegistry,
  PageStyleRestoreRule,
  PageStyleScope,
} from '@sniptale/runtime-contracts/page-style';
import { PAGE_STYLE_SCOPE_TYPES } from '@sniptale/runtime-contracts/page-style';
import { cloneRestoreRule } from './clone';
import { createPageStyleRestoreRuleRecord } from './records';
import type { SavePageStyleRestoreRuleInput } from './types';

interface RestoreRuleRegistryUpdate {
  existing: PageStyleRestoreRule | undefined;
  nextRegistry: PageStyleRegistry;
  rule: PageStyleRestoreRule;
}

function normalizeScope(scope: PageStyleScope): PageStyleScope {
  return {
    ...scope,
    active: scope.active ?? PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
  };
}

export function createRestoreRuleRegistryUpdate(args: {
  createId: () => string;
  input: SavePageStyleRestoreRuleInput;
  now: number;
  registry: PageStyleRegistry;
}): RestoreRuleRegistryUpdate {
  const existing = args.input.id
    ? args.registry.restoreRules.find((rule) => rule.id === args.input.id)
    : undefined;
  const rule = createPageStyleRestoreRuleRecord({
    createId: args.createId,
    input: args.input,
    normalizeScope,
    now: args.now,
    ...(existing === undefined ? {} : { existing }),
  });
  const nextRules = existing
    ? args.registry.restoreRules.map((current) => (current.id === rule.id ? rule : current))
    : [...args.registry.restoreRules, rule];

  return {
    existing,
    nextRegistry: { ...args.registry, restoreRules: nextRules },
    rule,
  };
}

export async function saveRestoreRuleRecord(args: {
  allowUpdate?: boolean;
  createId: () => string;
  input: SavePageStyleRestoreRuleInput;
  loadRegistry: () => Promise<PageStyleRegistry>;
  now: number;
  writeRegistry: (registry: PageStyleRegistry) => Promise<void>;
}): Promise<PageStyleRestoreRule> {
  const update = createRestoreRuleRegistryUpdate({
    createId: args.createId,
    input: args.input,
    now: args.now,
    registry: await args.loadRegistry(),
  });

  if (update.existing && args.allowUpdate !== true) {
    throw new Error('Use savePageStyleRestoreRuleWithAssetCleanup for restore rule updates.');
  }

  await args.writeRegistry(update.nextRegistry);
  return cloneRestoreRule(update.rule);
}

export async function updateRestoreRuleScope(args: {
  loadRegistry: () => Promise<PageStyleRegistry>;
  now: number;
  ruleId: string;
  scope: PageStyleScope;
  writeRegistry: (registry: PageStyleRegistry) => Promise<void>;
}): Promise<PageStyleRestoreRule | null> {
  const registry = await args.loadRegistry();
  let updatedRule: PageStyleRestoreRule | null = null;
  const nextRules = registry.restoreRules.map((rule) => {
    if (rule.id !== args.ruleId) {
      return rule;
    }

    updatedRule = {
      ...rule,
      scope: normalizeScope(args.scope),
      updatedAt: args.now,
    };
    return updatedRule;
  });

  if (!updatedRule) {
    return null;
  }

  await args.writeRegistry({ ...registry, restoreRules: nextRules });
  return cloneRestoreRule(updatedRule);
}
