// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';

import {
  DESIGN_SYSTEM_KIND_FILTERS,
  DESIGN_SYSTEM_PAGE_NAVIGATION,
  DESIGN_SYSTEM_SCOPE_FILTERS,
  DESIGN_SYSTEM_USAGE_MODES,
} from '../../catalog/registry/page-controls';
import type { DesignSystemUsageContext } from '../../catalog/registry/types';
import type { DesignSystemPageState } from '../page/state/types';
import { buildDesignSystemCommandPaletteActions } from './actions';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../catalog/localization', () => ({
  localize: (_locale: string, ru: string, en: string) => `${en}/${ru}`,
}));

function createUsageContext(
  usageId: string,
  labelEn: string,
  labelRu: string
): DesignSystemUsageContext {
  return {
    files: [],
    labelEn,
    labelRu,
    status: 'active',
    usageId,
  };
}

const toolbarUsage = createUsageContext('usage-1', 'Toolbar', 'Панель');
const dialogUsage = createUsageContext('usage-2', 'Dialog', 'Диалог');

function createFilterState(): DesignSystemPageState {
  return {
    clearFilters: vi.fn(),
    hasActiveFilters: true,
    kindFilter: 'all',
    scopeFilter: 'all',
    searchQuery: '',
    selectedUsageIds: ['usage-1'],
    selectedUsageOptions: [toolbarUsage],
    setKindFilter: vi.fn(),
    setScopeFilter: vi.fn(),
    setSearchQuery: vi.fn(),
    setUsageSearchQuery: vi.fn(),
    setUsageFilterMode: vi.fn(),
    toggleUsageFilter: vi.fn(),
    usageFilterMode: 'any',
    usageOptions: [toolbarUsage, dialogUsage],
    usageSearchQuery: '',
    filteredUsageOptions: [toolbarUsage, dialogUsage],
    ...createCatalogState(),
    ...createExplorerState(),
  };
}

function createCatalogState() {
  return {
    filteredEntries: [],
    filteredEntriesCount: 0,
    filteredUsageContexts: 0,
    filteredVariants: 0,
    productEntries: [],
    sharedEntries: [],
    totalUsageContexts: 0,
    totalVariants: 0,
  };
}

function createExplorerState() {
  return {
    expandedEntryId: null,
    isFilterPanelOpen: false,
    setExpandedEntryId: vi.fn(),
    setIsFilterPanelOpen: vi.fn(),
    toggleFilterPanel: vi.fn(),
  };
}

function createState(overrides: Partial<DesignSystemPageState> = {}): DesignSystemPageState {
  return {
    ...createFilterState(),
    ...overrides,
  };
}

function findAction(
  actions: ReturnType<typeof buildDesignSystemCommandPaletteActions>,
  id: string
) {
  return actions.find((action) => action.id === id);
}

function createActions(overrides: Partial<DesignSystemPageState> = {}) {
  return buildDesignSystemCommandPaletteActions({
    locale: 'en',
    previewTheme: 'light',
    setPreviewTheme: vi.fn(),
    state: createState(overrides),
  });
}

it('routes navigation and filter actions through the narrow state slice', () => {
  const state = createState();
  const setPreviewTheme = vi.fn();
  const actions = buildDesignSystemCommandPaletteActions({
    locale: 'en',
    previewTheme: 'light',
    setPreviewTheme,
    state,
  });

  findAction(actions, 'design-system-nav-product-catalog')?.onSelect();
  findAction(actions, 'design-system-theme-dark')?.onSelect();
  findAction(actions, 'design-system-scope-product')?.onSelect();
  findAction(actions, 'design-system-kind-feedback')?.onSelect();
  findAction(actions, 'design-system-usage-all')?.onSelect();
  findAction(actions, 'design-system-clear-filters')?.onSelect();
  findAction(actions, 'design-system-usage-usage-1')?.onSelect();

  expect(window.location.hash).toBe('#product-catalog');
  expect(setPreviewTheme).toHaveBeenCalledWith('dark');
  expect(state.setScopeFilter).toHaveBeenCalledWith('product-ui');
  expect(state.setKindFilter).toHaveBeenCalledWith('feedback');
  expect(state.setUsageFilterMode).toHaveBeenCalledWith('all');
  expect(state.clearFilters).toHaveBeenCalledOnce();
  expect(state.toggleUsageFilter).toHaveBeenCalledWith('usage-1');
});

it('builds the expected action inventory', () => {
  const actions = createActions();

  expect(actions).toHaveLength(
    DESIGN_SYSTEM_PAGE_NAVIGATION.length +
      2 +
      DESIGN_SYSTEM_SCOPE_FILTERS.length +
      DESIGN_SYSTEM_KIND_FILTERS.length +
      DESIGN_SYSTEM_USAGE_MODES.length +
      1 +
      2
  );
});

it('preserves current-context, toggle, and disabled filter semantics', () => {
  const actions = createActions({ hasActiveFilters: false });

  expect(findAction(actions, 'design-system-theme-light')?.subtitle).toBe(
    'shared.ui.commandPaletteCurrentContextHint'
  );
  expect(findAction(actions, 'design-system-theme-dark')?.subtitle).toBe(
    'shared.ui.commandPaletteToggleHint'
  );
  expect(findAction(actions, 'design-system-clear-filters')).toEqual(
    expect.objectContaining({
      disabled: true,
      disabledReason: 'shared.ui.commandPaletteDisabledContextHint',
    })
  );
});
