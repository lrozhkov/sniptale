import { useDeferredValue, useMemo } from 'react';
import type { AppLocale } from '../../../platform/i18n';
import { DESIGN_SYSTEM_REGISTRY } from '../../catalog/registry';
import type {
  DesignSystemRegistryEntry,
  DesignSystemUsageContext,
} from '../../catalog/registry/types';
import { localize } from '../../catalog/localization';
import type { DesignSystemPageFilters } from './filters';
import { filterDesignSystemEntries } from './search';
import { useDesignSystemUsageOptions } from './usage-options';

interface DesignSystemPageDerivedState {
  usageOptions: DesignSystemUsageContext[];
  filteredUsageOptions: DesignSystemUsageContext[];
  selectedUsageOptions: DesignSystemUsageContext[];
  filteredEntries: DesignSystemRegistryEntry[];
  sharedEntries: DesignSystemRegistryEntry[];
  productEntries: DesignSystemRegistryEntry[];
  filteredEntriesCount: number;
  filteredVariants: number;
  filteredUsageContexts: number;
  totalVariants: number;
  totalUsageContexts: number;
  hasActiveFilters: boolean;
}

function useDesignSystemRegistryTotals() {
  const totalVariants = useMemo(
    () => DESIGN_SYSTEM_REGISTRY.reduce((sum, entry) => sum + entry.variants.length, 0),
    []
  );
  const totalUsageContexts = useMemo(
    () => DESIGN_SYSTEM_REGISTRY.reduce((sum, entry) => sum + entry.usageContexts.length, 0),
    []
  );

  return { totalUsageContexts, totalVariants };
}

function useDesignSystemUsageState(locale: AppLocale, filters: DesignSystemPageFilters) {
  const usageOptions = useDesignSystemUsageOptions(locale);
  const selectedUsageOptions = useMemo(
    () => usageOptions.filter((usage) => filters.selectedUsageIds.includes(usage.usageId)),
    [filters.selectedUsageIds, usageOptions]
  );
  const filteredUsageOptions = useMemo(
    () => filterUsageOptions(locale, usageOptions, filters.usageSearchQuery),
    [filters.usageSearchQuery, locale, usageOptions]
  );

  return { filteredUsageOptions, selectedUsageOptions, usageOptions };
}

export function useDesignSystemPageDerivedState(
  locale: AppLocale,
  filters: DesignSystemPageFilters
): DesignSystemPageDerivedState {
  const deferredSearchQuery = useDeferredValue(filters.searchQuery);
  const hasActiveFilters = checkHasActiveFilters(filters, deferredSearchQuery);

  const { totalUsageContexts, totalVariants } = useDesignSystemRegistryTotals();
  const { filteredUsageOptions, selectedUsageOptions, usageOptions } = useDesignSystemUsageState(
    locale,
    filters
  );

  const filteredEntries = useMemo(() => {
    const normalizedQuery = deferredSearchQuery.trim().toLowerCase();
    return filterDesignSystemEntries(locale, filters, normalizedQuery);
  }, [deferredSearchQuery, filters, locale]);

  const { sharedEntries, productEntries, filteredVariants, filteredUsageContexts } = useMemo(
    () => buildFilteredEntryStats(filteredEntries),
    [filteredEntries]
  );

  return {
    usageOptions,
    filteredUsageOptions,
    selectedUsageOptions,
    filteredEntries,
    sharedEntries,
    productEntries,
    filteredEntriesCount: filteredEntries.length,
    filteredVariants,
    filteredUsageContexts,
    totalVariants,
    totalUsageContexts,
    hasActiveFilters,
  };
}

function buildFilteredEntryStats(filteredEntries: DesignSystemRegistryEntry[]) {
  return {
    sharedEntries: filteredEntries.filter((entry) => entry.scope === 'shared-ui'),
    productEntries: filteredEntries.filter((entry) => entry.scope === 'product-ui'),
    filteredVariants: filteredEntries.reduce((sum, entry) => sum + entry.variants.length, 0),
    filteredUsageContexts: filteredEntries.reduce(
      (sum, entry) => sum + entry.usageContexts.length,
      0
    ),
  };
}

function checkHasActiveFilters(filters: DesignSystemPageFilters, deferredSearchQuery: string) {
  return (
    filters.scopeFilter !== 'all' ||
    filters.kindFilter !== 'all' ||
    filters.selectedUsageIds.length > 0 ||
    deferredSearchQuery.trim() !== ''
  );
}

function filterUsageOptions(
  locale: AppLocale,
  usageOptions: DesignSystemUsageContext[],
  usageSearchQuery: string
) {
  const normalizedQuery = usageSearchQuery.trim().toLowerCase();
  if (normalizedQuery === '') {
    return usageOptions;
  }

  return usageOptions.filter((usage) => {
    const localizedLabel = localize(locale, usage.labelRu, usage.labelEn).toLowerCase();
    return (
      localizedLabel.includes(normalizedQuery) ||
      usage.usageId.toLowerCase().includes(normalizedQuery)
    );
  });
}
