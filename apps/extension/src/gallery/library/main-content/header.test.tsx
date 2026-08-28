// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { productSelectPropsMock, translateMock } = vi.hoisted(() => ({
  productSelectPropsMock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../platform/i18n')>();
  return {
    ...actual,
    translate: translateMock,
  };
});

vi.mock('@sniptale/ui/product-form-controls', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sniptale/ui/product-form-controls')>();
  return {
    ...actual,
    ProductSelect: (props: {
      onChange: (value: string) => void;
      options: Array<{ value: string }>;
      value: string;
    }) => {
      productSelectPropsMock(props);
      const isSort = props.options.some((option) => option.value === 'newest');
      return (
        <button
          type="button"
          data-ui={isSort ? 'test.sort' : 'test.scope'}
          onClick={() => props.onChange(isSort ? 'name-asc' : 'temporary')}
        >
          {props.value}
        </button>
      );
    },
  };
});

import { GalleryHeader, GalleryHeaderBanner } from './header';
import { createMediaItem } from '../actions/test-support/index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function updateInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) {
    throw new Error('Expected native input value setter');
  }

  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function clickButton(button: Element | null | undefined) {
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('Expected button');
  }

  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function renderHeader(props: Partial<Parameters<typeof GalleryHeader>[0]> = {}) {
  const headerProps = {
    allTags: [],
    activeStorageBarClass: 'storage-normal',
    folderFilter: 'all' as const,
    isBusy: false,
    importTriggerRef: { current: null },
    mediaImportTriggerRef: { current: null },
    onApplySelectionTag: vi.fn(),
    onClearSelection: vi.fn(),
    onDeleteMany: vi.fn(),
    onDeleteAll: vi.fn(),
    onExportBackup: vi.fn(),
    onImportBackupClick: vi.fn(),
    onImportMediaClick: vi.fn(),
    onSearchChange: vi.fn(),
    onScopeChange: vi.fn(),
    onSelectionTagDraftChange: vi.fn(),
    onSelectionBackup: vi.fn(),
    onSelectionZip: vi.fn(),
    onSortModeChange: vi.fn(),
    onViewModeChange: vi.fn(),
    search: '',
    scope: 'all' as const,
    selectedItems: [],
    selectedSize: 0,
    selectionTagDraft: '',
    sortMode: 'newest' as const,
    storageInfo: {
      usage: 1024,
      quota: 4096,
      remaining: 3072,
      usageRatio: 0.25,
      pressure: 'healthy' as const,
      isPersistent: true,
    },
    viewMode: 'compact-grid' as const,
    ...props,
  };

  act(() => {
    root?.render(<GalleryHeader {...headerProps} />);
  });

  return headerProps;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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
  vi.unstubAllGlobals();
});

it('wires compact search, sort, and centered view-mode controls without manual refresh', () => {
  const props = renderHeader({ search: 'needle' });
  const segment = container?.querySelector('[data-ui="gallery.header.segment"]');
  const input = container?.querySelector('input');
  const sortButton = container?.querySelector('[data-ui="test.sort"]');
  const listModeButton = container?.querySelector(
    '[data-ui="gallery.header.view-mode.gallery.app.viewModeList"]'
  );

  if (!input || !sortButton || !listModeButton) {
    throw new Error('Expected gallery header controls');
  }

  expect(container?.querySelector('header')?.className).toContain('min-h-12');
  expect(container?.querySelector('header')?.className).toContain('h-12');
  expect(container?.querySelector('header')?.className).toContain(
    'rounded-[var(--sniptale-radius-lg)]'
  );
  expect(container?.querySelector('header')?.className).toContain('z-30');
  expect(container?.querySelector('header')?.className).not.toContain('px-3');
  expect(segment?.className).toContain('lg:w-[19rem]');
  expect(segment?.className).toContain('px-3');
  const controls = container?.querySelector('[data-ui="gallery.header.controls"]');
  const workspace = container?.querySelector('[data-ui="gallery.header.workspace"]');
  expect(controls?.className).toContain('flex-nowrap');
  expect(controls?.className).toContain('shrink-0');
  expect(workspace?.className).toContain('flex-nowrap');
  expect(container?.querySelector('[aria-label="gallery.app.refresh"]')).toBeNull();
  expect(input.parentElement?.className).toContain('focus-within:w-48');
  expect(input.parentElement?.className).toContain(
    'transition-[width,border-color,background-color]'
  );
  expect(input.parentElement?.className).toContain('w-36');
  expect(listModeButton.className).toContain('h-full');
  expect(listModeButton.querySelector('svg')?.classList.contains('block')).toBe(true);

  act(() => {
    updateInputValue(input, 'updated search');
    sortButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    listModeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(productSelectPropsMock).toHaveBeenCalledWith(expect.objectContaining({ value: 'newest' }));
  expect(productSelectPropsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      className: expect.stringContaining('!h-8'),
      containerClassName: expect.stringContaining('w-[9.5rem]'),
      controlSize: 'sm',
      value: 'newest',
    })
  );
  expect(props.onSearchChange).toHaveBeenCalled();
  expect(props.onSortModeChange).toHaveBeenCalledWith('name-asc');
  expect(props.onViewModeChange).toHaveBeenCalledWith('list');
  expect(container?.textContent).toContain('gallery.app.title');
  expect(container?.textContent).not.toContain('gallery.app.description');
});

it('keeps canonical name sorts and removes size sorting for scenarios', () => {
  renderHeader({ folderFilter: 'scenario' });

  const sortProps = productSelectPropsMock.mock.calls
    .map(([props]) => props)
    .find((props) => props.value === 'newest');
  expect(sortProps.options).toEqual(
    expect.arrayContaining([{ value: 'name-asc', label: 'gallery.app.sortNameAsc' }])
  );
  expect(sortProps.options).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ value: 'size-desc' })])
  );
});

it('keeps browsing controls on the right and adds selection actions on the left', () => {
  renderHeader({ selectedItems: [createMediaItem({ id: 'selected' })], selectedSize: 256 });

  expect(container?.querySelector('input[aria-label="gallery.app.searchLabel"]')).not.toBeNull();
  expect(container?.textContent).toContain('gallery.app.selectedPrefix 1');
  expect(container?.querySelector('[data-ui="test.sort"]')).not.toBeNull();
  expect(container?.querySelector('[data-ui="gallery.header.workspace"]')).not.toBeNull();
  expect(container?.querySelector('header')?.className).toContain('max-2xl:h-[5.25rem]');
  expect(container?.querySelector('[data-ui="gallery.header.workspace"]')?.className).toContain(
    'max-2xl:grid-rows-[2rem_2rem]'
  );
  expect(container?.querySelector('[data-ui="gallery.header.controls"]')?.className).toContain(
    'max-2xl:row-start-1'
  );
});

it('opens compact storage actions without a separate cleanup workflow', () => {
  const props = renderHeader();
  const storageButton = container?.querySelector<HTMLButtonElement>(
    '[data-ui="gallery.header.storage"] > button'
  );

  expect(storageButton?.className).toContain('h-8');
  expect(storageButton?.className).toContain('w-40');
  expect(storageButton?.textContent).toContain('/');

  clickButton(storageButton);

  const menu = container?.querySelector('[data-ui="gallery.header.storage-menu"]');
  const exportButton = Array.from(menu?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes('gallery.app.exportBackup')
  );
  expect(menu?.textContent).toContain('gallery.app.storageUsed');
  expect(menu?.textContent).toContain('gallery.app.storageAvailable');

  expect(menu?.querySelectorAll('[role="menuitem"]')).toHaveLength(4);
  expect(menu?.textContent).toContain('gallery.app.importMediaFiles');
  clickButton(exportButton);

  expect(props.onExportBackup).toHaveBeenCalledTimes(1);
  expect(container?.querySelector('[data-ui="gallery.header.storage-menu"]')).toBeNull();
});

it('exposes Web Snapshot as a distinct action in the Library import section', () => {
  const onImportWebSnapshotClick = vi.fn();
  renderHeader({
    onImportWebSnapshotClick,
    webSnapshotImportTriggerRef: { current: null },
  });
  clickButton(
    container?.querySelector<HTMLButtonElement>('[data-ui="gallery.header.storage"] > button')
  );
  const menu = container?.querySelector('[data-ui="gallery.header.storage-menu"]');
  const action = Array.from(menu?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes('gallery.app.importWebSnapshot')
  );
  expect(menu?.textContent).toContain('gallery.app.importSection');
  expect(menu?.querySelectorAll('[role="menuitem"]')).toHaveLength(5);
  clickButton(action);
  expect(onImportWebSnapshotClick).toHaveBeenCalledOnce();
});

it('removes low-usage storage progress from layout and centers the usage label', () => {
  renderHeader({
    storageInfo: {
      usage: 24,
      quota: 100,
      remaining: 76,
      usageRatio: 0.24,
      pressure: 'healthy',
      isPersistent: true,
    },
  });

  expect(container?.querySelector('[data-ui="gallery.header.storage-progress"]')).toBeNull();
  expect(container?.querySelector('[data-ui="gallery.header.storage-usage"]')?.className).toContain(
    'justify-center'
  );

  renderHeader();

  expect(container?.querySelector('[data-ui="gallery.header.storage-progress"]')).not.toBeNull();
});

it('renders banner actions only when warning copy exists', () => {
  const withBanner = {
    banner: 'Storage warning',
    onBannerDismiss: vi.fn(),
  };

  act(() => {
    root?.render(<GalleryHeaderBanner {...withBanner} />);
  });

  const buttons = Array.from(container?.querySelectorAll('button') ?? []);
  const closeButton = buttons.find((button) =>
    button.textContent?.includes('common.actions.close')
  );

  if (!closeButton) {
    throw new Error('Expected banner actions');
  }

  act(() => {
    closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(withBanner.onBannerDismiss).toHaveBeenCalledTimes(1);
  expect(buttons).toHaveLength(1);

  act(() => {
    root?.render(<GalleryHeaderBanner banner={null} onBannerDismiss={vi.fn()} />);
  });
  expect(container?.textContent).not.toContain('Storage warning');
});
