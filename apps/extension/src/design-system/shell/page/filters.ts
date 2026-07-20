import { useState } from 'react';
import type {
  DesignSystemPageFilters,
  DesignSystemPageKindFilter,
  DesignSystemPageScopeFilter,
  DesignSystemPageUsageFilterMode,
} from './state/types';

export type { DesignSystemPageFilters } from './state/types';

export function useDesignSystemPageFilters(): DesignSystemPageFilters {
  const [searchQuery, setSearchQuery] = useState('');
  const [usageSearchQuery, setUsageSearchQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<DesignSystemPageScopeFilter>('all');
  const [kindFilter, setKindFilter] = useState<DesignSystemPageKindFilter>('all');
  const [usageFilterMode, setUsageFilterMode] = useState<DesignSystemPageUsageFilterMode>('any');
  const [selectedUsageIds, setSelectedUsageIds] = useState<string[]>([]);

  function toggleUsageFilter(usageId: string) {
    setSelectedUsageIds((current) =>
      current.includes(usageId) ? current.filter((item) => item !== usageId) : [...current, usageId]
    );
  }

  function clearFilters() {
    setSearchQuery('');
    setUsageSearchQuery('');
    setScopeFilter('all');
    setKindFilter('all');
    setUsageFilterMode('any');
    setSelectedUsageIds([]);
  }

  return {
    searchQuery,
    setSearchQuery,
    usageSearchQuery,
    setUsageSearchQuery,
    scopeFilter,
    setScopeFilter,
    kindFilter,
    setKindFilter,
    usageFilterMode,
    setUsageFilterMode,
    selectedUsageIds,
    toggleUsageFilter,
    clearFilters,
  };
}
