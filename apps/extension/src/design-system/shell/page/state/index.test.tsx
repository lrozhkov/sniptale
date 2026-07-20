// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDesignSystemPageState } from '.';

const { useDesignSystemPageDerivedStateMock, useDesignSystemPageFiltersMock } = vi.hoisted(() => ({
  useDesignSystemPageDerivedStateMock: vi.fn(),
  useDesignSystemPageFiltersMock: vi.fn(),
}));
const { useDesignSystemPageExplorerStateMock } = vi.hoisted(() => ({
  useDesignSystemPageExplorerStateMock: vi.fn(),
}));

vi.mock('../derived-state', () => ({
  useDesignSystemPageDerivedState: useDesignSystemPageDerivedStateMock,
}));

vi.mock('../filters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../filters')>()),
  useDesignSystemPageFilters: useDesignSystemPageFiltersMock,
}));

vi.mock('../explorer-state', () => ({
  useDesignSystemPageExplorerState: useDesignSystemPageExplorerStateMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useDesignSystemPageState> | null = null;

function HookHarness() {
  latestState = useDesignSystemPageState('en');
  return null;
}

async function renderHarness() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<HookHarness />);
  });
}

function primeDesignSystemPageStateMocks() {
  useDesignSystemPageFiltersMock.mockReset();
  useDesignSystemPageDerivedStateMock.mockReset();
  latestState = null;

  useDesignSystemPageFiltersMock.mockReturnValue({
    clearFilters: vi.fn(),
    hasActiveFilters: true,
    kindFilter: 'all',
    productEntries: ['product-filter-entry'],
    scopeFilter: 'all',
    searchQuery: 'button',
    selectedUsageIds: ['usage-1'],
    setExpandedEntryId: vi.fn(),
    setIsFilterPanelOpen: vi.fn(),
    setKindFilter: vi.fn(),
    setScopeFilter: vi.fn(),
    setSearchQuery: vi.fn(),
    setUsageSearchQuery: vi.fn(),
    setUsageFilterMode: vi.fn(),
    sharedEntries: ['shared-filter-entry'],
    toggleFilterPanel: vi.fn(),
    toggleUsageFilter: vi.fn(),
    usageSearchQuery: 'toolbar',
    usageFilterMode: 'any',
    usageOptions: [{ labelEn: 'Toolbar', labelRu: 'Панель', usageId: 'usage-1' }],
  });
  useDesignSystemPageDerivedStateMock.mockReturnValue({
    filteredEntries: ['filtered-entry'],
    filteredEntriesCount: 3,
    filteredUsageOptions: ['filtered-usage'],
    filteredUsageContexts: 4,
    filteredVariants: 5,
    productEntries: ['product-derived-entry'],
    selectedUsageOptions: ['selected-usage'],
    sharedEntries: ['shared-derived-entry'],
    totalUsageContexts: 6,
    totalVariants: 7,
  });
  useDesignSystemPageExplorerStateMock.mockReturnValue({
    expandedEntryId: 'entry-1',
    isFilterPanelOpen: false,
    setExpandedEntryId: vi.fn(),
    setIsFilterPanelOpen: vi.fn(),
    toggleFilterPanel: vi.fn(),
  });
}

function cleanupHarness() {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
}

async function verifyMergedDesignSystemPageState() {
  await renderHarness();

  expect(useDesignSystemPageDerivedStateMock).toHaveBeenCalledWith(
    'en',
    expect.objectContaining({
      searchQuery: 'button',
      selectedUsageIds: ['usage-1'],
      usageSearchQuery: 'toolbar',
    })
  );
  expect(useDesignSystemPageExplorerStateMock).toHaveBeenCalledWith(['filtered-entry']);
  expect(latestState).toEqual(
    expect.objectContaining({
      expandedEntryId: 'entry-1',
      filteredEntries: ['filtered-entry'],
      searchQuery: 'button',
      filteredEntriesCount: 3,
      filteredUsageOptions: ['filtered-usage'],
      filteredVariants: 5,
      selectedUsageOptions: ['selected-usage'],
      totalUsageContexts: 6,
      productEntries: ['product-derived-entry'],
      sharedEntries: ['shared-derived-entry'],
    })
  );
}

describe('useDesignSystemPageState', () => {
  beforeEach(primeDesignSystemPageStateMocks);

  afterEach(cleanupHarness);

  it(
    'merges filters with derived catalog state and explorer state while forwarding locale plus filters',
    verifyMergedDesignSystemPageState
  );
});
