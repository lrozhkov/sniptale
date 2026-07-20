// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DesignSystemPageFilters } from './filters';
import { useDesignSystemPageDerivedState } from './derived-state';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let currentFilters: DesignSystemPageFilters | null = null;
let latestState: ReturnType<typeof useDesignSystemPageDerivedState> | null = null;

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
    usageFilterMode: 'any',
    usageSearchQuery: '',
    ...overrides,
  };
}

function Harness() {
  latestState = useDesignSystemPageDerivedState('en', currentFilters!);
  return null;
}

async function renderHarness() {
  await act(async () => {
    root?.render(<Harness />);
  });
}

describe('useDesignSystemPageDerivedState', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    latestState = null;
    currentFilters = null;
    root = null;
    container?.remove();
    container = null;
  });

  it('derives usage chips and entry stats from the page filters', verifyDerivedUsageAndStats);

  it(
    'keeps the usage search field advisory-only without activating result filters',
    verifyAdvisoryUsageSearch
  );
});

async function verifyDerivedUsageAndStats() {
  currentFilters = createFilters({
    searchQuery: 'content-size-tooltip',
    selectedUsageIds: ['content.selection.size-tooltip'],
    usageSearchQuery: 'tooltip',
  });

  await renderHarness();

  expect(latestState?.hasActiveFilters).toBe(true);
  expect(latestState?.filteredEntriesCount).toBe(1);
  expect(latestState?.selectedUsageOptions.map((usage) => usage.usageId)).toEqual([
    'content.selection.size-tooltip',
  ]);
  expect(latestState?.filteredUsageOptions.some((usage) => usage.usageId.includes('tooltip'))).toBe(
    true
  );
}

async function verifyAdvisoryUsageSearch() {
  currentFilters = createFilters({
    usageSearchQuery: 'toolbar',
  });

  await renderHarness();

  expect(latestState?.hasActiveFilters).toBe(false);
  expect(latestState?.filteredEntriesCount).toBeGreaterThan(1);
  expect(latestState?.filteredUsageOptions.length).toBeGreaterThan(0);
}
