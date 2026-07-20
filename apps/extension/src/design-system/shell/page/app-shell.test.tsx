// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DesignSystemAppShell } from './app-shell';

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

vi.mock('./filter-sections', () => ({
  DesignSystemFiltersSection: () => <div data-testid="filters-section" />,
}));

vi.mock('./navigation-rail', () => ({
  DesignSystemNavigationRail: () => <div data-testid="navigation-rail" />,
}));

vi.mock('./overview-section', () => ({
  DesignSystemOverviewSection: () => <div data-testid="overview-section" />,
}));

vi.mock('./catalog-sections', () => ({
  DesignSystemTokenGroupsSection: () => <div data-testid="token-groups" />,
}));

vi.mock('./catalog-explorer', () => ({
  DesignSystemCatalogExplorerSection: (props: { sectionId: string }) => (
    <div data-testid={`explorer-${props.sectionId}`}>{props.sectionId}</div>
  ),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

describe('DesignSystemAppShell', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
  });

  it('renders the compact workspace shell', verifyCompactWorkspaceShell);
});

async function verifyCompactWorkspaceShell() {
  const state = {
    expandedEntryId: 'entry-a',
    filteredEntriesCount: 2,
    filteredUsageContexts: 4,
    filteredVariants: 3,
    productEntries: [{ componentId: 'entry-b' }],
    setExpandedEntryId: vi.fn(),
    sharedEntries: [{ componentId: 'entry-a' }],
    totalUsageContexts: 6,
    totalVariants: 5,
  } as never;

  await act(async () => {
    root?.render(
      <DesignSystemAppShell
        locale="en"
        previewMap={new Map()}
        previewTheme="dark"
        setPreviewTheme={vi.fn()}
        state={state}
      />
    );
  });

  expect(container?.querySelector('[data-testid="filters-section"]')).not.toBeNull();
  expect(container?.querySelector('[data-testid="navigation-rail"]')).not.toBeNull();
  expect(container?.querySelector('[data-testid="overview-section"]')).not.toBeNull();
  expect(container?.querySelector('[data-testid="token-groups"]')).not.toBeNull();
  expect(container?.querySelector('[data-testid="explorer-shared-catalog"]')).not.toBeNull();
  expect(container?.querySelector('[data-testid="explorer-product-catalog"]')).not.toBeNull();
}
