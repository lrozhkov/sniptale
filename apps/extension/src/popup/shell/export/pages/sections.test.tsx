// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const exportSectionMocks = vi.hoisted(() => ({
  exportProgressSectionViewMock: vi.fn(),
}));

vi.mock('../../../../platform/i18n', () => ({
  translate: (key: string) => `t:${key}`,
}));

vi.mock('../progress/view', () => ({
  ExportProgressSectionView: (props: unknown) => {
    exportSectionMocks.exportProgressSectionViewMock(props);
    return <div data-testid="progress-view">progress</div>;
  },
}));

import { ExportProgressSection } from '../progress';
import { ExportReadySection } from '../ready';

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
const defaultToggleSetters = {
  setIncludeBasicLogs: vi.fn(),
  setIncludeCssDiagnostics: vi.fn(),
  setIncludeFiles: vi.fn(),
  setIncludeFullPageScreenshot: vi.fn(),
  setIncludeHarDomLogs: vi.fn(),
  setIncludeImages: vi.fn(),
  setIncludeJson: vi.fn(),
  setIncludeMarkdown: vi.fn(),
};

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

function createReadyProps(
  overrides: Partial<React.ComponentProps<typeof ExportReadySection>> = {}
): React.ComponentProps<typeof ExportReadySection> {
  return {
    availableTabs: defaultTabs,
    disabled: false,
    filterQuery: '',
    filteredTabs: defaultTabs.slice(0, 1),
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
    selectedCount: 1,
    selectedTabIds: [7],
    setFilterQuery: vi.fn(),
    ...defaultToggleSetters,
    toggleSelectAllTabs: vi.fn(),
    toggleTabSelection: vi.fn(),
    ...overrides,
  };
}

async function clickButton(button: Element | null | undefined) {
  await act(async () => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

async function dismissByOutsideClick() {
  await act(async () => {
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  });
}

async function dismissByEscape() {
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  });
}

async function openDrawer(index: number) {
  const editButtons = [...(container?.querySelectorAll('button') ?? [])].filter(
    (button) => button.textContent === 't:popup.export.editButton'
  );
  expect(editButtons).toHaveLength(2);
  await clickButton(editButtons[index]);
}

async function verifyDataTypeDrawerCanOpenAndClose() {
  await openDrawer(0);
  expect(container?.textContent).not.toContain('t:popup.export.tabsSectionLabel');
  expect(container?.querySelector('input')?.getAttribute('placeholder')).toBe(
    't:popup.export.dataTypesFilterPlaceholder'
  );
  expect(container?.textContent).toContain('t:popup.export.includeBasicLogsLabel');
  expect(container?.textContent).toContain('t:popup.export.doneButton');

  await dismissByOutsideClick();

  expect(container?.textContent).toContain('t:popup.export.includeJsonLabel');
  expect(container?.textContent).toContain('t:popup.export.tabsSectionLabel');
  expect(container?.textContent).not.toContain('t:popup.export.doneButton');
}

async function verifyTabsDrawerCanOpenAndClose() {
  await openDrawer(1);
  expect(container?.textContent).not.toContain('t:popup.export.dataTypesSectionLabel');
  expect(container?.querySelector('input')?.getAttribute('placeholder')).toBe(
    't:popup.export.tabsFilterPlaceholder'
  );

  await dismissByEscape();

  expect(container?.textContent).toContain('Current tab');
  expect(container?.textContent).toContain('t:popup.export.dataTypesSectionLabel');
  expect(container?.querySelector('input')).toBeNull();
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
  exportSectionMocks.exportProgressSectionViewMock.mockReset();
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

describe('export progress section', () => {
  it('passes progress props through to the progress section view', async () => {
    const props: React.ComponentProps<typeof ExportProgressSection> = {
      isExporting: true,
      onCancel: vi.fn(),
      progress: { current: 1, errors: [], message: 'Scanning', phase: 'scanning', total: 2 },
      progressSteps: [{ key: 'json', label: 'JSON', status: 'active', statusLabel: 'Active' }],
      result: null,
    };

    await renderNode(<ExportProgressSection {...props} />);

    expect(exportSectionMocks.exportProgressSectionViewMock).toHaveBeenCalledWith(props);
  });
});

describe('export ready section rendering', () => {
  it('renders unified data-type and page sections in the ready section', async () => {
    const props = createReadyProps();

    await renderNode(<ExportReadySection {...props} />);

    expect(container?.textContent).toContain('t:popup.export.dataTypesSectionLabel');
    expect(container?.textContent).toContain('t:popup.export.tabsSectionLabel');
    expect(container?.textContent).toContain('t:popup.export.includeJsonLabel');
    expect(container?.textContent).toContain('t:popup.export.includeMarkdownLabel');
    expect(container?.textContent).toContain('Current tab');
    expect(container?.textContent).not.toContain('t:popup.export.includeJsonDescription');
    expect(container?.textContent).not.toContain('t:popup.export.includeMarkdownDescription');
    expect(container?.textContent).not.toContain('https://example.test/current');
    expect(container?.textContent).not.toContain('t:popup.export.contentGroupLabel');
    expect(container?.textContent).not.toContain('t:popup.export.diagnosticsGroupLabel');
    expect(
      container?.querySelector('[data-testid="export-data-type-summary"]')?.className
    ).not.toContain('grid-cols-2');
  });

  it('opens and closes the data-type drawer through edit button and outside click', async () => {
    await renderNode(<ExportReadySection {...createReadyProps()} />);
    await verifyDataTypeDrawerCanOpenAndClose();
  });
});

async function verifyPagesDrawerInteraction() {
  await renderNode(<ExportReadySection {...createReadyProps()} />);
  await verifyTabsDrawerCanOpenAndClose();
}

async function verifyInlineSummaryRemoval() {
  const setIncludeJson = vi.fn();
  const toggleTabSelection = vi.fn();

  await renderNode(
    <ExportReadySection
      {...createReadyProps({
        selectedCount: 2,
        selectedTabIds: [7, 8],
        setIncludeJson,
        toggleTabSelection,
      })}
    />
  );

  const buttons = [...(container?.querySelectorAll('button') ?? [])];
  const removeButtons = buttons.filter((button) =>
    button.getAttribute('aria-label')?.startsWith('t:popup.export.removeFromSelectionAction')
  );

  await clickButton(removeButtons[0]);
  await clickButton(removeButtons.at(-1));

  expect(setIncludeJson).toHaveBeenCalledWith(false);
  expect(toggleTabSelection).toHaveBeenCalledWith(8);
}

async function verifyNoSelectableTabsHint() {
  await renderNode(
    <ExportReadySection
      {...createReadyProps({
        disabled: true,
        filteredTabs: [],
        selectedCount: 0,
        selectedTabIds: [],
      })}
    />
  );

  expect(container?.textContent).toContain('t:popup.export.noSelectableTabsHint');
}

describe('export ready section interactions', () => {
  it(
    'opens and closes the tabs drawer through edit button and Escape',
    verifyPagesDrawerInteraction
  );

  it('removes summary items inline without reopening edit mode', verifyInlineSummaryRemoval);

  it(
    'shows the no-selectable-tabs hint when ready controls are disabled without selection',
    verifyNoSelectableTabsHint
  );
});
