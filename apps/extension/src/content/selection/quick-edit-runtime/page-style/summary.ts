import type {
  PageStyleCurrentPageRuleSummary,
  PageStyleRestoreRule,
  PageStyleRuleSummary,
} from '@sniptale/runtime-contracts/page-style';
import type { PageStyleMatchedRule } from './matching';
import type { PageStyleRuntimePageIdentity } from './identity';

function createRuntimeRuleSummary(rule: PageStyleRestoreRule): PageStyleRuleSummary {
  return {
    enabled: rule.enabled,
    id: rule.id,
    name: rule.name,
    propertySummary: [...rule.propertySummary],
    scope: { ...rule.scope },
  };
}

export function createCurrentPageAppliedRuleSummary(args: {
  matchedRules: PageStyleMatchedRule[];
  page: PageStyleRuntimePageIdentity;
}): PageStyleCurrentPageRuleSummary {
  const matchedRules = args.matchedRules.map((match) => createRuntimeRuleSummary(match.rule));

  return {
    activeAppliedCount: matchedRules.length,
    matchedRules,
    ...(args.page.pageDomain !== null ? { pageDomain: args.page.pageDomain } : {}),
    pageUrl: args.page.pageUrl,
  };
}
