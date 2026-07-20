// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { useDesignSystemPageFilters } from './filters';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestFilters: ReturnType<typeof useDesignSystemPageFilters> | null = null;

function FiltersHarness() {
  latestFilters = useDesignSystemPageFilters();
  return null;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<FiltersHarness />);
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  latestFilters = null;
  root = null;
  container?.remove();
  container = null;
});

it('toggles usage filters and clears all filter state', () => {
  expect(latestFilters?.selectedUsageIds).toEqual([]);

  act(() => {
    latestFilters?.setSearchQuery('button');
    latestFilters?.setUsageSearchQuery('menu');
    latestFilters?.setScopeFilter('shared-ui');
    latestFilters?.setKindFilter('primitive');
    latestFilters?.setUsageFilterMode('all');
    latestFilters?.toggleUsageFilter('marketing');
    latestFilters?.toggleUsageFilter('admin');
  });

  expect(latestFilters?.searchQuery).toBe('button');
  expect(latestFilters?.usageSearchQuery).toBe('menu');
  expect(latestFilters?.scopeFilter).toBe('shared-ui');
  expect(latestFilters?.kindFilter).toBe('primitive');
  expect(latestFilters?.usageFilterMode).toBe('all');
  expect(latestFilters?.selectedUsageIds).toEqual(['marketing', 'admin']);

  act(() => {
    latestFilters?.toggleUsageFilter('marketing');
  });
  expect(latestFilters?.selectedUsageIds).toEqual(['admin']);

  act(() => {
    latestFilters?.clearFilters();
  });

  expect(latestFilters?.searchQuery).toBe('');
  expect(latestFilters?.usageSearchQuery).toBe('');
  expect(latestFilters?.scopeFilter).toBe('all');
  expect(latestFilters?.kindFilter).toBe('all');
  expect(latestFilters?.usageFilterMode).toBe('any');
  expect(latestFilters?.selectedUsageIds).toEqual([]);
});
