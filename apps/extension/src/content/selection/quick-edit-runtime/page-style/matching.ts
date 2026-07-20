import {
  PAGE_STYLE_SCOPE_TYPES,
  type PageStyleRestoreRule,
  type PageStyleScope,
} from '@sniptale/runtime-contracts/page-style';
import type { PageStyleRuntimeDiagnostic } from './diagnostics';
import { createPageStyleRuntimeDiagnostic } from './diagnostics';
import { resolvePageStyleRuleElement } from './element';
import type { PageStyleRuntimePageIdentity } from './identity';

export interface PageStyleMatchedRule {
  element: HTMLElement;
  rule: PageStyleRestoreRule;
}

interface PageStyleRuleMatchResult {
  diagnostics: PageStyleRuntimeDiagnostic[];
  matchedRules: PageStyleMatchedRule[];
}

function isScopeRelevantToPage(scope: PageStyleScope, page: PageStyleRuntimePageIdentity): boolean {
  if (scope.active === PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS) {
    return scope.exactAddress === page.pageUrl;
  }

  return Boolean(scope.domain && page.pageDomain && scope.domain === page.pageDomain);
}

function compareRuleOrder(left: PageStyleRestoreRule, right: PageStyleRestoreRule): number {
  if (left.scope.active !== right.scope.active) {
    return left.scope.active === PAGE_STYLE_SCOPE_TYPES.DOMAIN ? -1 : 1;
  }

  if (left.createdAt !== right.createdAt) {
    return left.createdAt - right.createdAt;
  }

  return left.id.localeCompare(right.id);
}

export function matchPageStyleRestoreRules(args: {
  page: PageStyleRuntimePageIdentity;
  rules: PageStyleRestoreRule[];
}): PageStyleRuleMatchResult {
  const diagnostics: PageStyleRuntimeDiagnostic[] = [];
  const matchedRules: PageStyleMatchedRule[] = [];

  for (const rule of args.rules.filter((item) => item.enabled).sort(compareRuleOrder)) {
    if (!isScopeRelevantToPage(rule.scope, args.page)) {
      continue;
    }

    const element = resolvePageStyleRuleElement(rule);
    if (!element) {
      diagnostics.push(
        createPageStyleRuntimeDiagnostic(
          'warning',
          'Page style rule selector did not resolve',
          rule.id
        )
      );
      continue;
    }

    matchedRules.push({ element, rule });
  }

  return { diagnostics, matchedRules };
}
