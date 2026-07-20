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

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('../data-type/section', () => ({
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
    disabled: false,
    filterQuery: '',
    filteredTabs: [],
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

it('shows the no-selectable-tabs hint only after loaded disabled state has no selection', () => {
  const hint = 'popup.export.noSelectableTabsHint';

  renderReady(createProps({ disabled: true, hasLoadedPreferences: false, selectedCount: 0 }));
  expect(container?.textContent).not.toContain(hint);

  renderReady(createProps({ disabled: false, hasLoadedPreferences: true, selectedCount: 0 }));
  expect(container?.textContent).not.toContain(hint);

  renderReady(createProps({ disabled: true, hasLoadedPreferences: true, selectedCount: 1 }));
  expect(container?.textContent).not.toContain(hint);

  renderReady(createProps({ disabled: true, hasLoadedPreferences: true, selectedCount: 0 }));
  expect(container?.textContent).toContain(hint);
});
