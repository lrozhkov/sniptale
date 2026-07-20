import type {
  PageStyleCurrentPageRuleSummary,
  PageStylePatch,
  PageStyleProperty,
  PageStyleRegistry,
  PageStyleRestoreRule,
  PageStyleRuleSummary,
} from '@sniptale/runtime-contracts/page-style';
import { PAGE_STYLE_SCOPE_TYPES } from '@sniptale/runtime-contracts/page-style';
import { cloneScope } from './clone';

interface PageStylePageIdentity {
  pageDomain?: string | null;
  pageUrl: string;
}

export function createCurrentPageRuleSummary(
  registry: PageStyleRegistry,
  page: PageStylePageIdentity
): PageStyleCurrentPageRuleSummary {
  const matchedRules = registry.restoreRules.filter((rule) => isRuleRelevantToPage(rule, page));
  return {
    activeAppliedCount: matchedRules.filter((rule) => rule.enabled).length,
    matchedRules: matchedRules.map(createRuleSummary),
    ...(page.pageDomain !== undefined ? { pageDomain: page.pageDomain } : {}),
    pageUrl: page.pageUrl,
  };
}

export function summarizePatchProperties(patch: PageStylePatch): PageStyleProperty[] {
  const properties = new Set<PageStyleProperty>();

  for (const declaration of patch.declarations) {
    properties.add(declaration.property);
  }

  return [...properties];
}

function createRuleSummary(rule: PageStyleRestoreRule): PageStyleRuleSummary {
  return {
    enabled: rule.enabled,
    id: rule.id,
    name: rule.name,
    propertySummary: [...rule.propertySummary],
    scope: cloneScope(rule.scope),
  };
}

function isRuleRelevantToPage(rule: PageStyleRestoreRule, page: PageStylePageIdentity): boolean {
  if (rule.scope.active === PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS) {
    return rule.scope.exactAddress === page.pageUrl;
  }

  return Boolean(rule.scope.domain && page.pageDomain && rule.scope.domain === page.pageDomain);
}
