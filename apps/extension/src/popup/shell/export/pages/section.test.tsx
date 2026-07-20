// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportPagesSection } from './section';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => `t:${key}`,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const defaultTabs = [
  {
    disabledReason: null,
    favIconUrl: 'https://example.test/favicon-current.ico',
    isCurrent: true,
    tabId: 7,
    title: 'Current tab',
    url: 'https://example.test/current',
  },
  {
    disabledReason: null,
    favIconUrl: 'https://example.test/favicon-second.ico',
    isCurrent: false,
    tabId: 8,
    title: 'Second tab',
    url: 'https://example.test/second',
  },
];

function createProps(
  overrides: Partial<React.ComponentProps<typeof ExportPagesSection>> = {}
): React.ComponentProps<typeof ExportPagesSection> {
  return {
    availableTabs: defaultTabs,
    filterQuery: '',
    filteredTabs: defaultTabs,
    isExpanded: false,
    isFilterActive: false,
    isOpen: false,
    onClose: vi.fn(),
    onOpen: vi.fn(),
    selectedCount: 1,
    selectedTabIds: [7],
    setFilterQuery: vi.fn(),
    toggleSelectAllTabs: vi.fn(),
    toggleTabSelection: vi.fn(),
    ...overrides,
  };
}

async function renderSection(props: React.ComponentProps<typeof ExportPagesSection>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ExportPagesSection {...props} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ExportPagesSection', () => {
  it('renders the empty-state summary when no tabs are selected', verifyEmptySummary);
  it('renders selected tabs in summary mode and removes them inline', verifySelectedSummaryRemoval);
  it(
    'switches the bulk action label to clear-all only for fully selected visible tabs',
    verifyBulkActionLabels
  );
});

async function verifyEmptySummary(): Promise<void> {
  await renderSection(
    createProps({
      selectedCount: 0,
      selectedTabIds: [],
    })
  );

  expect(container?.textContent).toContain('t:popup.export.noSelectedTabs');
}

function getRemoveButtons(): HTMLButtonElement[] {
  return [...(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])].filter((button) =>
    button.getAttribute('aria-label')?.startsWith('t:popup.export.removeFromSelectionAction')
  );
}

async function verifySelectedSummaryRemoval(): Promise<void> {
  const toggleTabSelection = vi.fn();

  await renderSection(
    createProps({
      selectedCount: 2,
      selectedTabIds: [7, 8],
      toggleTabSelection,
    })
  );

  expect(container?.textContent).toContain('Current tab');
  expect(container?.textContent).toContain('Second tab');

  const removeButtons = getRemoveButtons();
  expect(removeButtons).toHaveLength(2);

  await act(async () => {
    removeButtons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(toggleTabSelection).toHaveBeenCalledWith(7);
}

async function verifyBulkActionLabels(): Promise<void> {
  await renderSection(
    createProps({
      isOpen: true,
      selectedCount: 2,
      selectedTabIds: [7, 8],
    })
  );

  expect(container?.textContent).toContain('t:popup.export.clearAllTabsButton');
  await renderFilteredOpenSection();
  expect(container?.textContent).toContain('t:popup.export.selectAllTabsButton');
}

async function renderFilteredOpenSection(): Promise<void> {
  await renderSection(
    createProps({
      isOpen: true,
      isFilterActive: true,
      selectedCount: 2,
      selectedTabIds: [7, 8],
    })
  );
}
