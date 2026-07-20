import type {
  PageStyleProperty,
  PageStyleRestoreRule,
} from '@sniptale/runtime-contracts/page-style';
import type { PageStyleRuleDraft, PageStyleRuleListItem, PageStyleRuleStatusFilter } from './types';

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase();
}

function countAssetReferences(rule: PageStyleRestoreRule): number {
  const assetIds = new Set(rule.patch.assets.map((asset) => asset.assetId));

  if (rule.contentRetention?.image) {
    assetIds.add(rule.contentRetention.image.asset.assetId);
  }

  return assetIds.size;
}

function createDraft(rule: PageStyleRestoreRule): PageStyleRuleDraft {
  return {
    active: rule.scope.active,
    domain: rule.scope.domain ?? '',
    exactAddress: rule.scope.exactAddress,
  };
}

export function createPageStyleRuleListItem(rule: PageStyleRestoreRule): PageStyleRuleListItem {
  const exactAddressText = rule.scope.exactAddress;
  const domainText = rule.scope.domain ?? '';
  const selectorText = [rule.selector.locator, rule.selector.sniptaleId ?? ''].join(' ');
  const propertiesText = rule.propertySummary.join(' ');
  const normalizedAddress = normalizeText([exactAddressText, domainText].join(' '));
  const normalizedSearchText = normalizeText(
    [rule.name, exactAddressText, domainText, selectorText, propertiesText].join(' ')
  );

  return {
    assetReferenceCount: countAssetReferences(rule),
    domainText,
    draft: createDraft(rule),
    exactAddressText,
    hasContentRetention: Boolean(rule.contentRetention?.text || rule.contentRetention?.image),
    normalizedAddress,
    normalizedProperties: new Set(rule.propertySummary),
    normalizedSearchText,
    rule,
  };
}

export function filterPageStyleRuleItems(args: {
  addressQuery?: string;
  items: PageStyleRuleListItem[];
  propertyFilter: PageStyleProperty | 'all';
  searchQuery: string;
  statusFilter: PageStyleRuleStatusFilter;
}): PageStyleRuleListItem[] {
  const query = normalizeText(args.searchQuery);
  const addressQuery = normalizeText(args.addressQuery);

  return args.items.filter((item) => {
    if (query && !item.normalizedSearchText.includes(query)) {
      return false;
    }

    if (addressQuery && !item.normalizedAddress.includes(addressQuery)) {
      return false;
    }

    if (args.propertyFilter !== 'all' && !item.normalizedProperties.has(args.propertyFilter)) {
      return false;
    }

    if (args.statusFilter === 'enabled') {
      return item.rule.enabled;
    }

    if (args.statusFilter === 'disabled') {
      return !item.rule.enabled;
    }

    if (args.statusFilter === 'contentRetaining') {
      return item.hasContentRetention;
    }

    if (args.statusFilter === 'assetBacked') {
      return item.assetReferenceCount > 0;
    }

    return true;
  });
}

export function getDistinctRuleProperties(items: PageStyleRuleListItem[]): PageStyleProperty[] {
  return [...new Set(items.flatMap((item) => item.rule.propertySummary))].sort();
}
