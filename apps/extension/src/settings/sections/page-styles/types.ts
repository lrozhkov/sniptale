import type {
  PageStyleProperty,
  PageStyleRestoreRule,
  PageStyleScope,
} from '@sniptale/runtime-contracts/page-style';

export type PageStyleRuleStatusFilter =
  | 'all'
  | 'assetBacked'
  | 'contentRetaining'
  | 'disabled'
  | 'enabled';

export interface PageStyleRuleDraft {
  active: PageStyleScope['active'];
  domain: string;
  exactAddress: string;
}

export interface PageStyleRuleListItem {
  assetReferenceCount: number;
  domainText: string;
  draft: PageStyleRuleDraft;
  exactAddressText: string;
  hasContentRetention: boolean;
  normalizedAddress: string;
  normalizedProperties: Set<PageStyleProperty>;
  normalizedSearchText: string;
  rule: PageStyleRestoreRule;
}

export interface PageStyleRulesControllerState {
  actionError: string | null;
  addressQuery: string;
  confirmationMessage: string | null;
  drafts: Record<string, PageStyleRuleDraft>;
  filteredItems: PageStyleRuleListItem[];
  isLoading: boolean;
  isMutating: boolean;
  items: PageStyleRuleListItem[];
  loadError: string | null;
  propertyFilter: PageStyleProperty | 'all';
  searchQuery: string;
  statusFilter: PageStyleRuleStatusFilter;
}
