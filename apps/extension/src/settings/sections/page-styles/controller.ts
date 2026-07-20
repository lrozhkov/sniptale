import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  PAGE_STYLE_SCOPE_TYPES,
  type PageStyleProperty,
  type PageStyleRestoreRule,
} from '@sniptale/runtime-contracts/page-style';
import { translate } from '../../../platform/i18n';
import { listPageStyleRestoreRules } from '../../../composition/persistence/page-style/storage';
import {
  createPageStyleRuleListItem,
  filterPageStyleRuleItems,
  getDistinctRuleProperties,
} from './filters';
import type {
  PageStyleRuleDraft,
  PageStyleRuleListItem,
  PageStyleRuleStatusFilter,
  PageStyleRulesControllerState,
} from './types';
import { useRuleStorageActions } from './controller-actions';

type RuleDataState = {
  drafts: Record<string, PageStyleRuleDraft>;
  isLoading: boolean;
  items: PageStyleRuleListItem[];
  loadError: string | null;
  loadRules: (isStale?: () => boolean) => Promise<void>;
  setDrafts: Dispatch<SetStateAction<Record<string, PageStyleRuleDraft>>>;
};

type FilterState = {
  addressQuery: string;
  filteredItems: PageStyleRuleListItem[];
  propertyFilter: PageStyleProperty | 'all';
  propertyOptions: PageStyleProperty[];
  searchQuery: string;
  setAddressQuery: (value: string) => void;
  setPropertyFilter: (value: PageStyleProperty | 'all') => void;
  setSearchQuery: (value: string) => void;
  setStatusFilter: (value: PageStyleRuleStatusFilter) => void;
  statusFilter: PageStyleRuleStatusFilter;
};

function createDrafts(items: PageStyleRuleListItem[]): Record<string, PageStyleRuleDraft> {
  return Object.fromEntries(items.map((item) => [item.rule.id, item.draft]));
}

function usePageStyleRuleData(): RuleDataState {
  const [items, setItems] = useState<PageStyleRuleListItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, PageStyleRuleDraft>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadRules = useCallback(async (isStale: () => boolean = () => false) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const nextItems = (await listPageStyleRestoreRules()).map(createPageStyleRuleListItem);
      if (isStale()) {
        return;
      }
      setItems(nextItems);
      setDrafts(createDrafts(nextItems));
    } catch {
      if (!isStale()) {
        setLoadError(translate('settings.pageStyles.loadError'));
      }
    } finally {
      if (!isStale()) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let stale = false;
    void loadRules(() => stale);
    return () => {
      stale = true;
    };
  }, [loadRules]);

  return { drafts, isLoading, items, loadError, loadRules, setDrafts };
}

function usePageStyleRuleFilters(items: PageStyleRuleListItem[]): FilterState {
  const [searchQuery, setSearchQuery] = useState('');
  const [addressQuery, setAddressQuery] = useState('');
  const [propertyFilter, setPropertyFilter] = useState<PageStyleProperty | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<PageStyleRuleStatusFilter>('all');

  const filteredItems = useMemo(
    () =>
      filterPageStyleRuleItems({
        addressQuery,
        items,
        propertyFilter,
        searchQuery,
        statusFilter,
      }),
    [addressQuery, items, propertyFilter, searchQuery, statusFilter]
  );
  const propertyOptions = useMemo(() => getDistinctRuleProperties(items), [items]);

  return {
    addressQuery,
    filteredItems,
    propertyFilter,
    propertyOptions,
    searchQuery,
    setAddressQuery,
    setPropertyFilter,
    setSearchQuery,
    setStatusFilter,
    statusFilter,
  };
}

function usePageStyleRuleMutations(loadRules: () => Promise<void>) {
  const [isMutating, setIsMutating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);

  const runMutation = useCallback(
    async (task: () => Promise<string | null>, fallbackKey: 'deleteError' | 'saveError') => {
      setIsMutating(true);
      setActionError(null);
      setConfirmationMessage(null);
      try {
        const message = await task();
        await loadRules();
        setConfirmationMessage(message);
      } catch {
        setActionError(translate(`settings.pageStyles.${fallbackKey}`));
      } finally {
        setIsMutating(false);
      }
    },
    [loadRules]
  );

  return { actionError, confirmationMessage, isMutating, runMutation };
}

export function usePageStyleRulesController(): {
  clearDomain: (ruleId: string) => void;
  deleteRule: (ruleId: string) => Promise<void>;
  propertyOptions: PageStyleProperty[];
  refresh: () => Promise<void>;
  saveScope: (ruleId: string) => Promise<void>;
  setDraft: (ruleId: string, draft: PageStyleRuleDraft) => void;
  setAddressQuery: (value: string) => void;
  setPropertyFilter: (value: PageStyleProperty | 'all') => void;
  setSearchQuery: (value: string) => void;
  setStatusFilter: (value: PageStyleRuleStatusFilter) => void;
  state: PageStyleRulesControllerState;
  toggleEnabled: (rule: PageStyleRestoreRule) => Promise<void>;
} {
  const data = usePageStyleRuleData();
  const { loadRules } = data;
  const filters = usePageStyleRuleFilters(data.items);
  const refresh = useCallback(() => loadRules(), [loadRules]);
  const mutations = usePageStyleRuleMutations(refresh);
  const draftActions = useRuleDraftActions(data.setDrafts);
  const ruleActions = useRuleStorageActions({
    drafts: data.drafts,
    runMutation: mutations.runMutation,
  });

  return {
    ...draftActions,
    ...ruleActions,
    propertyOptions: filters.propertyOptions,
    refresh,
    setAddressQuery: filters.setAddressQuery,
    setPropertyFilter: filters.setPropertyFilter,
    setSearchQuery: filters.setSearchQuery,
    setStatusFilter: filters.setStatusFilter,
    state: createControllerState({ data, filters, mutations }),
  };
}

function useRuleDraftActions(setDrafts: RuleDataState['setDrafts']) {
  const setDraft = useCallback(
    (ruleId: string, draft: PageStyleRuleDraft) => {
      setDrafts((current) => ({ ...current, [ruleId]: draft }));
    },
    [setDrafts]
  );
  const clearDomain = useCallback(
    (ruleId: string) => {
      setDrafts((current) => clearDraftDomain(current, ruleId));
    },
    [setDrafts]
  );

  return { clearDomain, setDraft };
}

function clearDraftDomain(
  current: Record<string, PageStyleRuleDraft>,
  ruleId: string
): Record<string, PageStyleRuleDraft> {
  const draft = current[ruleId];
  if (!draft) {
    return current;
  }

  return {
    ...current,
    [ruleId]: { ...draft, active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS, domain: '' },
  };
}

function createControllerState(args: {
  data: RuleDataState;
  filters: FilterState;
  mutations: ReturnType<typeof usePageStyleRuleMutations>;
}): PageStyleRulesControllerState {
  return {
    actionError: args.mutations.actionError,
    addressQuery: args.filters.addressQuery,
    confirmationMessage: args.mutations.confirmationMessage,
    drafts: args.data.drafts,
    filteredItems: args.filters.filteredItems,
    isLoading: args.data.isLoading,
    isMutating: args.mutations.isMutating,
    items: args.data.items,
    loadError: args.data.loadError,
    propertyFilter: args.filters.propertyFilter,
    searchQuery: args.filters.searchQuery,
    statusFilter: args.filters.statusFilter,
  };
}
