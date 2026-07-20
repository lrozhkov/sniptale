import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PAGE_STYLE_INSPECTOR_TABS,
  type PageStyleInspectorTab,
  type PageStyleRestoreRule,
} from '@sniptale/runtime-contracts/page-style';
import { translate } from '../../../../platform/i18n';
import {
  listPageStyleRestoreRules,
  listPageStyleTemplates,
  summarizePageStyleRulesForPage,
} from '../../../../composition/persistence/page-style/storage';
import { isPageStyleRulesUiEnabled } from '../../../../platform/config/page-style-rules-access';
import { readCurrentPageStyleIdentity } from '../runtime/actions';
import { addPageStyleInspectorOpenListener } from '../../../selection/quick-edit/page-style-events';
import { setQuickEditStyleInspectorModeEnabled } from '../../../selection/quick-edit-runtime/page-style-inspection';
import {
  findInspectablePageStyleElement,
  readPageStyleSelectionSnapshot,
  type PageStyleSelectionSnapshot,
} from '../runtime/properties';
import { isTrustedMouseEvent } from '../../../platform/trusted-events';
import type { PageStyleInspectorViewState } from '../types';

function resolvePageStyleInspectorTab(tab: PageStyleInspectorTab | undefined) {
  if (tab === PAGE_STYLE_INSPECTOR_TABS.RULES && !isPageStyleRulesUiEnabled()) {
    return PAGE_STYLE_INSPECTOR_TABS.PROPERTIES;
  }

  return tab ?? PAGE_STYLE_INSPECTOR_TABS.PROPERTIES;
}

export function useInspectorOpenState(quickEditDocumentMode: boolean) {
  const [activeTab, setActiveTab] = useState<PageStyleInspectorTab>(
    PAGE_STYLE_INSPECTOR_TABS.PROPERTIES
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    return addPageStyleInspectorOpenListener((detail) => {
      setActiveTab(resolvePageStyleInspectorTab(detail?.targetTab));
      setOpen(true);
    });
  }, []);

  useEffect(() => {
    if (quickEditDocumentMode) {
      setOpen(false);
    }
  }, [quickEditDocumentMode]);

  return { activeTab, open, setActiveTab, setOpen };
}

export function useInspectorSelection(args: {
  open: boolean;
  quickEditDocumentMode: boolean;
  quickEditMode: boolean;
}) {
  const [selection, setSelection] = useState<PageStyleSelectionSnapshot | null>(null);

  useEffect(() => {
    if (!args.open || !args.quickEditMode || args.quickEditDocumentMode) {
      return;
    }

    function handleClick(event: MouseEvent) {
      if (!isTrustedMouseEvent(event)) {
        return;
      }

      const element = findInspectablePageStyleElement(event.target);
      const snapshot = element ? readPageStyleSelectionSnapshot(element) : null;
      if (!snapshot) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setSelection(snapshot);
    }

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [args.open, args.quickEditDocumentMode, args.quickEditMode]);

  useEffect(() => {
    if (!args.quickEditMode || args.quickEditDocumentMode) {
      setSelection(null);
    }
  }, [args.quickEditDocumentMode, args.quickEditMode]);

  useEffect(() => {
    const enabled = args.open && args.quickEditMode && !args.quickEditDocumentMode;
    setQuickEditStyleInspectorModeEnabled(enabled);

    return () => {
      setQuickEditStyleInspectorModeEnabled(false);
    };
  }, [args.open, args.quickEditDocumentMode, args.quickEditMode]);

  return { selection, setSelection };
}

export function useRegistryData(open: boolean) {
  const [templates, setTemplates] = useState<PageStyleInspectorViewState['templates']>([]);
  const [rules, setRules] = useState<PageStyleRestoreRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshGuards = useRegistryRefreshGuards();

  const refresh = useCallback(async () => {
    const sequence = refreshGuards.nextSequence();
    setLoading(true);
    setError(null);

    try {
      const nextData = await loadRegistryData();
      if (!refreshGuards.canCommit(sequence)) {
        return;
      }

      setTemplates(nextData.templates);
      setRules(nextData.rules);
    } catch {
      if (refreshGuards.canCommit(sequence)) {
        setError(translate('content.pageStyleInspector.registryLoadError'));
      }
    } finally {
      if (refreshGuards.canCommit(sequence)) {
        setLoading(false);
      }
    }
  }, [refreshGuards]);

  useEffect(() => {
    if (open) {
      void refresh();
    }
  }, [open, refresh]);

  return { error, loading, refresh, rules, templates };
}

function useRegistryRefreshGuards() {
  const mountedRef = useRef(true);
  const refreshSequenceRef = useRef(0);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  const canCommit = useCallback(
    (sequence: number) => mountedRef.current && refreshSequenceRef.current === sequence,
    []
  );
  const nextSequence = useCallback(() => {
    refreshSequenceRef.current += 1;
    return refreshSequenceRef.current;
  }, []);

  return useMemo(() => ({ canCommit, nextSequence }), [canCommit, nextSequence]);
}

async function loadRegistryData() {
  const page = readCurrentPageStyleIdentity();
  const [templates, allRules, summary] = await Promise.all([
    listPageStyleTemplates(),
    listPageStyleRestoreRules(),
    summarizePageStyleRulesForPage(page),
  ]);
  const relevantIds = new Set(summary.matchedRules.map((rule) => rule.id));

  return {
    rules: sortPageStyleRulesByPageRelevance(allRules, relevantIds),
    templates,
  };
}

function sortPageStyleRulesByPageRelevance(
  rules: PageStyleRestoreRule[],
  relevantIds: Set<string>
): PageStyleRestoreRule[] {
  return rules.toSorted((left, right) => {
    const leftRelevant = relevantIds.has(left.id);
    const rightRelevant = relevantIds.has(right.id);
    if (leftRelevant !== rightRelevant) {
      return leftRelevant ? -1 : 1;
    }

    return right.updatedAt - left.updatedAt;
  });
}
