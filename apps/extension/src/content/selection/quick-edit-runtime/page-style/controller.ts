import {
  PAGE_STYLE_INSPECTOR_TABS,
  type PageStyleInspectorTab,
} from '@sniptale/runtime-contracts/page-style';
import { createLogger } from '@sniptale/platform/observability/logger';
import { listPageStyleRestoreRules } from '../../../../composition/persistence/page-style/storage';
import { applyPageStyleRule } from './apply';
import { createPageStyleAssetResolver, type PageStyleAssetResolver } from './assets';
import type { PageStyleRuntimeDiagnostic } from './diagnostics';
import { readPageStyleRuntimePageIdentity, type PageStyleRuntimePageIdentity } from './identity';
import { matchPageStyleRestoreRules } from './matching';
import { createCurrentPageAppliedRuleSummary } from './summary';

const logger = createLogger({ namespace: 'ContentPageStyleRuntime' });

interface PageStyleInspectorOpenState {
  isOpen: boolean;
  requestId: number;
  targetTab: PageStyleInspectorTab;
}

interface PageStyleRuntimeApplyResult {
  appliedRuleIds: string[];
  diagnostics: PageStyleRuntimeDiagnostic[];
}

interface PageStyleRuntimeController {
  applyMatchingRestoreRules: () => Promise<PageStyleRuntimeApplyResult>;
  dispose: () => void;
  getCurrentPageAppliedRuleSummary: () => Promise<
    ReturnType<typeof createCurrentPageAppliedRuleSummary>
  >;
  getInspectorOpenState: () => PageStyleInspectorOpenState;
  openInspector: (targetTab: PageStyleInspectorTab) => PageStyleInspectorOpenState;
}

interface PageStyleRuntimeDeps {
  assetResolver?: PageStyleAssetResolver;
  listRules?: typeof listPageStyleRestoreRules;
  readPage?: () => PageStyleRuntimePageIdentity;
}

type PageStyleRuntimeMatches = Awaited<
  ReturnType<ReturnType<typeof createPageStyleRuntimeMatchResolver>>
>;

function logDiagnostics(diagnostics: PageStyleRuntimeDiagnostic[]): void {
  for (const diagnostic of diagnostics) {
    const payload = diagnostic.ruleId ? { ruleId: diagnostic.ruleId } : undefined;
    if (diagnostic.level === 'error') {
      logger.error(diagnostic.message, payload);
    } else {
      logger.warn(diagnostic.message, payload);
    }
  }
}

function createPageStyleRuntimeMatchResolver(deps: {
  listRules: typeof listPageStyleRestoreRules;
  readPage: () => PageStyleRuntimePageIdentity;
}) {
  return async () => {
    const page = deps.readPage();
    const rules = await deps.listRules();
    const matchResult = matchPageStyleRestoreRules({ page, rules });
    logDiagnostics(matchResult.diagnostics);
    return { ...matchResult, page };
  };
}

async function applyMatchingPageStyleRules(args: {
  assetResolver: PageStyleAssetResolver;
  resolveMatches: () => Promise<PageStyleRuntimeMatches>;
}): Promise<PageStyleRuntimeApplyResult> {
  const matches = await args.resolveMatches();
  const diagnostics = [...matches.diagnostics];
  const appliedRuleIds: string[] = [];

  for (const match of matches.matchedRules) {
    const result = await applyPageStyleRule({
      assetResolver: args.assetResolver,
      element: match.element,
      rule: match.rule,
    });
    diagnostics.push(...result.diagnostics);
    logDiagnostics(result.diagnostics);
    if (result.applied) {
      appliedRuleIds.push(match.rule.id);
    }
  }

  return { appliedRuleIds, diagnostics };
}

function createPageStyleRuntimeSummaryCache(
  resolveMatches: () => Promise<PageStyleRuntimeMatches>
) {
  let revision = 0;
  let cachedSummary: ReturnType<typeof createCurrentPageAppliedRuleSummary> | null = null;
  return async () => {
    const requestRevision = revision + 1;
    revision = requestRevision;
    const matches = await resolveMatches();
    const summary = createCurrentPageAppliedRuleSummary(matches);

    if (requestRevision === revision) {
      cachedSummary = summary;
    }

    return requestRevision === revision || !cachedSummary ? summary : cachedSummary;
  };
}

function createPageStyleInspectorOpenState() {
  let revision = 0;
  let state: PageStyleInspectorOpenState = {
    isOpen: false,
    requestId: revision,
    targetTab: PAGE_STYLE_INSPECTOR_TABS.PROPERTIES,
  };
  return {
    get: () => state,
    open: (targetTab: PageStyleInspectorTab) => {
      revision += 1;
      state = { isOpen: true, requestId: revision, targetTab };
      return state;
    },
  };
}

export function createPageStyleRuntimeController(
  deps: PageStyleRuntimeDeps = {}
): PageStyleRuntimeController {
  const listRules = deps.listRules ?? listPageStyleRestoreRules;
  const readPage = deps.readPage ?? readPageStyleRuntimePageIdentity;
  const assetResolver = deps.assetResolver ?? createPageStyleAssetResolver();
  const resolveMatches = createPageStyleRuntimeMatchResolver({ listRules, readPage });
  const getCurrentPageAppliedRuleSummary = createPageStyleRuntimeSummaryCache(resolveMatches);
  const inspectorOpenState = createPageStyleInspectorOpenState();

  return {
    applyMatchingRestoreRules: () => applyMatchingPageStyleRules({ assetResolver, resolveMatches }),
    dispose: () => {
      assetResolver.dispose();
    },
    getCurrentPageAppliedRuleSummary,
    getInspectorOpenState: inspectorOpenState.get,
    openInspector: inspectorOpenState.open,
  };
}
