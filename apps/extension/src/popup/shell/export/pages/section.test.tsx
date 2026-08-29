// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportPagesSection } from './section';

vi.mock('../../../../platform/i18n/popup', async (importOriginal) => ({
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
    activeSourceMode: 'tabs',
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
    selectedUrls: [],
    setActiveSourceMode: vi.fn(),
    setFilterQuery: vi.fn(),
    toggleSelectAllTabs: vi.fn(),
    toggleTabSelection: vi.fn(),
    removeSelectedUrl: vi.fn(),
    setUrlInput: vi.fn(),
    timing: { loadTimeoutMs: 30_000, settleDelayMs: 2_000 },
    onTimingChange: vi.fn(),
    urlInput: '',
    urlInputInvalid: [],
    urlInputOverflow: 0,
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
  it('edits and summarizes address sources independently from tabs', verifyAddressMode);
});

async function verifyAddressMode(): Promise<void> {
  const setUrlInput = vi.fn();
  const setActiveSourceMode = vi.fn();
  await renderSection(
    createProps({
      activeSourceMode: 'urls',
      isOpen: true,
      selectedCount: 2,
      selectedUrls: ['https://one.example/', 'https://two.example/'],
      setUrlInput,
      setActiveSourceMode,
      urlInput: 'one.example\ntwo.example',
      urlInputInvalid: [],
    })
  );
  const textarea = container?.querySelector('textarea');
  expect(textarea?.value).toBe('one.example\ntwo.example');
  await act(async () => {
    if (!textarea) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(textarea, 'three.example');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(setUrlInput).toHaveBeenCalledWith('three.example');

  await renderSection(
    createProps({
      activeSourceMode: 'urls',
      selectedCount: 2,
      selectedUrls: ['https://one.example/', 'https://two.example/'],
      removeSelectedUrl: vi.fn(),
    })
  );
  expect(container?.textContent).toContain('one.example');
  expect(container?.textContent).toContain('two.example');
  const removeButton = getRemoveButtons()[0];
  await act(async () => removeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

  await renderSection(
    createProps({
      activeSourceMode: 'urls',
      isOpen: true,
      urlInput: 'bad value',
      urlInputInvalid: ['bad value'],
      urlInputOverflow: 2,
    })
  );
  expect(container?.textContent).toContain('t:popup.export.urlInputLimit');

  await renderSection(
    createProps({
      activeSourceMode: 'urls',
      isOpen: true,
      urlInput: 'bad value',
      urlInputInvalid: ['bad value'],
      urlInputOverflow: 0,
    })
  );
  expect(container?.textContent).toContain('t:popup.export.urlInputInvalid');
}

it('renders capture timing settings and persists a changed option', async () => {
  const onTimingChange = vi.fn();
  await renderSection(
    createProps({
      isOpen: true,
      isSettingsOpen: true,
      timing: { loadTimeoutMs: 30_000, settleDelayMs: 2_000 },
      onTimingChange,
    })
  );
  const select = container?.querySelector('select');
  await act(async () => {
    if (!select) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    setter?.call(select, '60000');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(onTimingChange).toHaveBeenCalledWith({ loadTimeoutMs: 60_000, settleDelayMs: 2_000 });
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
