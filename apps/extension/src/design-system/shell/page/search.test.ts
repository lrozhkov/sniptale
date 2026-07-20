import { expect, it } from 'vitest';

import type { DesignSystemPageFilters } from './filters';
import { filterDesignSystemEntries } from './search';

function createFilters(overrides: Partial<DesignSystemPageFilters> = {}): DesignSystemPageFilters {
  return {
    clearFilters: () => undefined,
    kindFilter: 'all',
    scopeFilter: 'all',
    searchQuery: '',
    selectedUsageIds: [],
    setKindFilter: () => undefined,
    setScopeFilter: () => undefined,
    setSearchQuery: () => undefined,
    setUsageSearchQuery: () => undefined,
    setUsageFilterMode: () => undefined,
    toggleUsageFilter: () => undefined,
    usageSearchQuery: '',
    usageFilterMode: 'any' as const,
    ...overrides,
  };
}

it('filters design-system entries by scope, kind, usage mode, and query text', () => {
  const allEntries = filterDesignSystemEntries('en', createFilters(), '');
  expect(allEntries.length).toBeGreaterThan(0);

  const scoped = filterDesignSystemEntries(
    'en',
    createFilters({ scopeFilter: allEntries[0]?.scope ?? 'all' }),
    ''
  );
  expect(scoped.every((entry) => entry.scope === scoped[0]?.scope)).toBe(true);

  const query = String(allEntries[0]?.componentId ?? '').toLowerCase();
  const searched = filterDesignSystemEntries('en', createFilters(), query);
  expect(searched.some((entry) => entry.componentId.toLowerCase().includes(query))).toBe(true);

  const usageId = allEntries[0]?.usageContexts[0]?.usageId;
  if (usageId) {
    const filtered = filterDesignSystemEntries(
      'en',
      createFilters({ selectedUsageIds: [usageId], usageFilterMode: 'all' }),
      ''
    );
    expect(
      filtered.every((entry) => entry.usageContexts.some((usage) => usage.usageId === usageId))
    ).toBe(true);
  }
});
