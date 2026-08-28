// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n/popup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n/popup')>()),
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
    includeAnnotations: false,
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot: false,
    includePageDiagnostics: false,
    includeImages: true,
    includeJson: true,
    includeMarkdown: true,
    includeWebCopy: false,
    isFilterActive: false,
    selectedCount: 2,
    selectedTabIds: [7, 8],
    setFilterQuery: vi.fn(),
    setIncludeAnnotations: vi.fn(),
    setIncludeBasicLogs: vi.fn(),
    setIncludeCssDiagnostics: vi.fn(),
    setIncludeFiles: vi.fn(),
    setIncludeFullPageScreenshot: vi.fn(),
    setIncludePageDiagnostics: vi.fn(),
    setIncludeImages: vi.fn(),
    setIncludeJson: vi.fn(),
    setIncludeMarkdown: vi.fn(),
    setIncludeWebCopy: vi.fn(),
    savePreferences: {
      actions: {
        setIncludeAnnotations: vi.fn(),
        setIncludeBasicLogs: vi.fn(),
        setIncludeCssDiagnostics: vi.fn(),
        setIncludeFiles: vi.fn(),
        setIncludeFullPageScreenshot: vi.fn(),
        setIncludePageDiagnostics: vi.fn(),
        setIncludeImages: vi.fn(),
        setIncludeJson: vi.fn(),
        setIncludeMarkdown: vi.fn(),
      },
      includeWebCopy: true,
      setIncludeWebCopy: vi.fn(),
      values: {
        includeAnnotations: false,
        includeBasicLogs: false,
        includeCssDiagnostics: false,
        includeFiles: false,
        includeFullPageScreenshot: false,
        includePageDiagnostics: false,
        includeImages: false,
        includeJson: false,
        includeMarkdown: false,
      },
    },
    onRequestWebCopySetup: vi.fn(),
    webSnapshotEnabled: true,
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
