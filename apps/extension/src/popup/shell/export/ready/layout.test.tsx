// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', () => ({
  translate: (key: string) => `t:${key}`,
}));

import { ExportReadySection } from '.';

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

function createReadyProps(
  overrides: Partial<React.ComponentProps<typeof ExportReadySection>> = {}
): React.ComponentProps<typeof ExportReadySection> {
  return {
    availableTabs: defaultTabs,
    disabled: false,
    filterQuery: '',
    filteredTabs: defaultTabs,
    hasLoadedPreferences: true,
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: true,
    includeJson: true,
    includeMarkdown: true,
    isFilterActive: false,
    selectedCount: 2,
    selectedTabIds: [7, 8],
    setFilterQuery: vi.fn(),
    setIncludeBasicLogs: vi.fn(),
    setIncludeCssDiagnostics: vi.fn(),
    setIncludeFiles: vi.fn(),
    setIncludeFullPageScreenshot: vi.fn(),
    setIncludeHarDomLogs: vi.fn(),
    setIncludeImages: vi.fn(),
    setIncludeJson: vi.fn(),
    setIncludeMarkdown: vi.fn(),
    toggleSelectAllTabs: vi.fn(),
    toggleTabSelection: vi.fn(),
    ...overrides,
  };
}

async function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(node);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('ExportReadySection layout', () => {
  it('renders the compact pages summary without URLs and without a capped list height', async () => {
    await renderNode(<ExportReadySection {...createReadyProps()} />);

    expect(container?.querySelector('[data-testid="export-pages-summary"]')).not.toBeNull();
    expect(container?.textContent).toContain('Current tab');
    expect(container?.textContent).toContain('Second tab');
    expect(container?.textContent).not.toContain('https://example.test/second');
    expect(container?.querySelector('img')?.getAttribute('src')).toBe(
      'https://example.test/favicon-current.ico'
    );
    expect(
      container
        ?.querySelector('[aria-label="t:popup.export.tabsSectionLabel"]')
        ?.className.includes('max-h-[188px]')
    ).toBe(false);
  });

  it('does not flash the no-selectable-tabs hint before preferences finish loading', async () => {
    await renderNode(
      <ExportReadySection
        {...createReadyProps({
          disabled: true,
          hasLoadedPreferences: false,
          selectedCount: 0,
          selectedTabIds: [],
        })}
      />
    );

    expect(container?.textContent).not.toContain('t:popup.export.noSelectableTabsHint');
  });
});
