// @vitest-environment jsdom

import { act, type ComponentProps, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dataTypes: vi.fn(),
  pages: vi.fn(),
}));

type DrawerProps = {
  children?: ReactNode;
  className?: string;
  isExpanded: boolean;
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
};

vi.mock('../../../../platform/i18n/popup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n/popup')>()),
  translate: (key: string) => key,
}));
vi.mock('../data-type/section', () => ({
  WebCopyResourceControls: () => <div data-ui="resources">resources</div>,
  ExportDataTypeSection: (props: DrawerProps) => {
    mocks.dataTypes(props);
    return (
      <button
        type="button"
        data-ui="data-types"
        data-open={String(props.isOpen)}
        onClick={props.isOpen ? props.onClose : props.onOpen}
      >
        data types
      </button>
    );
  },
}));
vi.mock('../pages/section', () => ({
  ExportPagesSection: (props: DrawerProps) => {
    mocks.pages(props);
    return (
      <button
        type="button"
        data-ui="pages"
        data-open={String(props.isOpen)}
        onClick={props.isOpen ? props.onClose : props.onOpen}
      >
        pages
      </button>
    );
  },
}));

import { ExportReadySection } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps(
  overrides: Partial<ComponentProps<typeof ExportReadySection>> = {}
): ComponentProps<typeof ExportReadySection> {
  return {
    availableTabs: [],
    destination: 'export',
    disabled: false,
    filterQuery: '',
    filteredTabs: [],
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
    selectedCount: 1,
    selectedTabIds: [7],
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
    onDestinationChange: vi.fn(),
    webCopyResources: {
      anonymousCrossOriginAssetsEnabled: true,
      authenticatedSameOriginAssetsEnabled: true,
      externalAssetRedirectsEnabled: true,
      externalLinksEnabled: false,
      error: null,
      pending: null,
      setAnonymousCrossOriginAssetsEnabled: vi.fn(),
      setAuthenticatedSameOriginAssetsEnabled: vi.fn(),
      setExternalAssetRedirectsEnabled: vi.fn(),
      setExternalLinksEnabled: vi.fn(),
    },
    toggleSelectAllTabs: vi.fn(),
    toggleTabSelection: vi.fn(),
    ...overrides,
  };
}

function renderReady(props = createProps()): void {
  container ??= document.createElement('div');
  root ??= createRoot(container);
  act(() => root?.render(<ExportReadySection {...props} />));
}

function clickDrawer(dataUi: 'data-types' | 'pages'): void {
  act(() => container?.querySelector<HTMLButtonElement>(`[data-ui="${dataUi}"]`)?.click());
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('opens and closes each ready-state drawer without rendering the other drawer', () => {
  renderReady();

  expect(container?.querySelector('[data-ui="data-types"]')).not.toBeNull();
  expect(container?.querySelector('[data-ui="pages"]')).not.toBeNull();
  expect(mocks.pages).toHaveBeenLastCalledWith(
    expect.objectContaining({ className: 'pt-2.5', isExpanded: true, isOpen: false })
  );

  clickDrawer('data-types');
  expect(container?.querySelector('[data-ui="data-types"]')?.getAttribute('data-open')).toBe(
    'true'
  );
  expect(container?.querySelector('[data-ui="pages"]')).toBeNull();

  clickDrawer('data-types');
  clickDrawer('pages');
  expect(container?.querySelector('[data-ui="data-types"]')).toBeNull();
  expect(container?.querySelector('[data-ui="pages"]')?.getAttribute('data-open')).toBe('true');
  expect(mocks.pages).toHaveBeenLastCalledWith(
    expect.objectContaining({ isExpanded: true, isOpen: true })
  );
  expect(mocks.pages.mock.calls.at(-1)?.[0]).not.toHaveProperty('className');

  clickDrawer('pages');
  expect(container?.querySelector('[data-ui="data-types"]')).not.toBeNull();
});

it('switches the common editor between independent download and Library preferences', () => {
  const props = createProps();
  renderReady(props);

  expect(mocks.dataTypes).toHaveBeenLastCalledWith(
    expect.objectContaining({ destination: 'export', includeFiles: true })
  );
  expect(
    container?.querySelector('button[aria-label="popup.export.packageDestinationDownload"]')
  ).not.toBeNull();
  expect(
    container?.querySelector('button[aria-label="popup.export.packageDestinationLibrary"]')
  ).not.toBeNull();
  const libraryButton = [...(container?.querySelectorAll('button') ?? [])].find((button) =>
    button.textContent?.includes('packageDestinationLibrary')
  );
  act(() => libraryButton?.click());

  expect(props.onDestinationChange).toHaveBeenCalledWith('save');
  expect(libraryButton?.getAttribute('aria-pressed')).toBe('false');
});

it('keeps destination switching available when no page is selected', () => {
  const props = createProps({ disabled: true, hasLoadedPreferences: true, selectedCount: 0 });
  renderReady(props);

  const libraryButton = [...(container?.querySelectorAll('button') ?? [])].find((button) =>
    button.textContent?.includes('packageDestinationLibrary')
  );
  expect(libraryButton?.disabled).toBe(false);
  act(() => libraryButton?.click());
  expect(props.onDestinationChange).toHaveBeenCalledWith('save');
  expect(container?.textContent).toContain('popup.export.noSelectableTabsHint');
});

it('shows the no-selectable-tabs hint only after loaded disabled state has no selection', () => {
  const hint = 'popup.export.noSelectableTabsHint';

  renderReady(createProps({ disabled: true, hasLoadedPreferences: false, selectedCount: 0 }));
  expect(container?.textContent).not.toContain(hint);

  renderReady(createProps({ disabled: false, hasLoadedPreferences: true, selectedCount: 0 }));
  expect(container?.textContent).toContain(hint);

  renderReady(createProps({ disabled: true, hasLoadedPreferences: true, selectedCount: 1 }));
  expect(container?.textContent).not.toContain(hint);

  renderReady(createProps({ disabled: true, hasLoadedPreferences: true, selectedCount: 0 }));
  expect(container?.textContent).toContain(hint);
});

it('shows HTML composition and resource settings without ZIP component controls', async () => {
  renderReady(createProps({ destination: 'html' }));
  expect(container?.textContent).toContain('packageDestinationHtmlDescription');
  expect(container?.querySelector('[data-ui="html-composition"]')).not.toBeNull();
  expect(container?.querySelector('[data-ui="pages"]')).not.toBeNull();
  act(() =>
    container
      ?.querySelector<HTMLButtonElement>('[data-ui="popup.export.selection-trigger"]')
      ?.click()
  );
  expect(container?.querySelector('[data-ui="html-resource-settings"]')).not.toBeNull();
  expect(container?.querySelector('[data-ui="data-types"]')).toBeNull();
  expect(container?.querySelector('[data-ui="pages"]')).toBeNull();
});

it('uses the expanding transition for all three destinations', () => {
  renderReady(createProps({ destination: 'html' }));
  const library = [
    ...(container?.querySelectorAll<HTMLButtonElement>('button[aria-pressed]') ?? []),
  ].find(
    (button) => button.getAttribute('aria-label') === 'popup.export.packageDestinationLibrary'
  );
  act(() => library?.click());
  renderReady(createProps({ destination: 'save' }));
  const switchButtons = [...(container?.querySelectorAll('button[aria-pressed]') ?? [])];
  expect(switchButtons).toHaveLength(3);
  expect(switchButtons.every((button) => button.className.includes('transition-[flex-grow'))).toBe(
    true
  );
  expect(
    switchButtons.find((button) => button.getAttribute('aria-pressed') === 'true')?.className
  ).toContain('grow-');
});
