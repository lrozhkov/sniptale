// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DesignSystemFiltersSection } from './filter-sections';

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

vi.mock('../../catalog/localization', () => ({
  localize: (_locale: string, ru: string, en: string) => `${en}/${ru}`,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createState(overrides: Record<string, unknown> = {}) {
  return {
    clearFilters: vi.fn(),
    expandedEntryId: 'entry-1',
    filteredEntries: [],
    filteredEntriesCount: 12,
    filteredUsageOptions: [
      { labelEn: 'Toolbar', labelRu: 'Панель', usageId: 'usage-1' },
      { labelEn: 'Menu', labelRu: 'Меню', usageId: 'usage-2' },
    ],
    hasActiveFilters: true,
    isFilterPanelOpen: true,
    kindFilter: 'all',
    productEntries: [],
    scopeFilter: 'all',
    searchQuery: '',
    selectedUsageIds: [],
    selectedUsageOptions: [],
    setExpandedEntryId: vi.fn(),
    setIsFilterPanelOpen: vi.fn(),
    setKindFilter: vi.fn(),
    setScopeFilter: vi.fn(),
    setSearchQuery: vi.fn(),
    setUsageSearchQuery: vi.fn(),
    setUsageFilterMode: vi.fn(),
    sharedEntries: [],
    toggleFilterPanel: vi.fn(),
    toggleUsageFilter: vi.fn(),
    usageFilterMode: 'any',
    usageSearchQuery: '',
    usageOptions: [
      { labelEn: 'Toolbar', labelRu: 'Панель', usageId: 'usage-1' },
      { labelEn: 'Menu', labelRu: 'Меню', usageId: 'usage-2' },
    ],
    ...overrides,
  };
}

async function renderSection(state: ReturnType<typeof createState>) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <DesignSystemFiltersSection
        locale="en"
        previewTheme="light"
        setPreviewTheme={vi.fn()}
        state={state as never}
      />
    );
  });
}

function findButton(label: string) {
  return Array.from(container?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent === label
  );
}

async function verifyFilterInteractions() {
  const state = createState();
  await renderSection(state);

  const searchInputs = container?.querySelectorAll('input[type="search"]') ?? [];
  const searchInput = searchInputs[0] as HTMLInputElement;
  const usageSearchInput = searchInputs[1] as HTMLInputElement;
  const setInputValue = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;

  await act(async () => {
    setInputValue?.call(searchInput, 'dialog');
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    setInputValue?.call(usageSearchInput, 'menu');
    usageSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
  });

  findButton('designSystem.page.hideFiltersButton')?.click();
  findButton('designSystem.page.scopeSharedLabel')?.click();
  findButton('designSystem.page.kindPrimitive')?.click();
  findButton('designSystem.page.filterUsageAll')?.click();
  findButton('designSystem.page.clearFilters')?.click();
  findButton('Toolbar/Панель')?.click();
  findButton('designSystem.page.darkPreview')?.click();

  expect(container?.querySelector('[data-ui="design-system.theme-preview.light"]')).not.toBeNull();
  expect(container?.querySelector('[data-ui="design-system.theme-preview.dark"]')).not.toBeNull();
  expect(state.setSearchQuery).toHaveBeenCalledWith('dialog');
  expect(state.setUsageSearchQuery).toHaveBeenCalledWith('menu');
  expect(state.toggleFilterPanel).toHaveBeenCalledOnce();
  expect(state.setScopeFilter).toHaveBeenCalledWith('shared-ui');
  expect(state.setKindFilter).toHaveBeenCalledWith('primitive');
  expect(state.setUsageFilterMode).toHaveBeenCalledWith('all');
  expect(state.clearFilters).toHaveBeenCalledOnce();
  expect(state.toggleUsageFilter).toHaveBeenCalledWith('usage-1');
}

async function verifySelectedUsageChips() {
  const state = createState({
    isFilterPanelOpen: false,
    selectedUsageIds: ['usage-2'],
    selectedUsageOptions: [{ labelEn: 'Menu', labelRu: 'Меню', usageId: 'usage-2' }],
    usageFilterMode: 'all',
  });
  await renderSection(state);

  findButton('Menu/Меню')?.click();

  expect(container?.textContent).toContain('Menu/Меню');
  expect(state.toggleUsageFilter).toHaveBeenCalledWith('usage-2');
}

describe('DesignSystemFiltersSection', () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
  });

  it(
    'routes workspace search, panel toggles, filters, and usage list interactions to state handlers',
    verifyFilterInteractions
  );

  it(
    'renders selected usage summary chips and their toggle handlers when filters are active',
    verifySelectedUsageChips
  );
});
