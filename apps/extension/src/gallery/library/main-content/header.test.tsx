// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS,
  INSPECTOR_SHELL_FIXED_HEADER_CLASS_NAME,
} from '@sniptale/ui/inspector-shell';

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
    ProductSelect: (props: { onChange: (value: string) => void; value: string }) => {
      productSelectPropsMock(props);
      return (
        <button type="button" data-ui="test.sort" onClick={() => props.onChange('size')}>
          {props.value}
        </button>
      );
    },
  };
});

import { GalleryHeader, GalleryHeaderBanner } from './header';

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

function renderHeader(props: Partial<Parameters<typeof GalleryHeader>[0]> = {}) {
  const headerProps = {
    folderFilter: 'all' as const,
    isLoading: false,
    onRefresh: vi.fn(),
    onSearchChange: vi.fn(),
    onSortModeChange: vi.fn(),
    onViewModeChange: vi.fn(),
    search: '',
    sortMode: 'newest' as const,
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

it('wires search, sort, refresh, and view-mode controls', () => {
  const props = renderHeader({ search: 'needle' });
  const segment = container?.querySelector('[data-ui="gallery.header.segment"]');
  const input = container?.querySelector('input');
  const sortButton = container?.querySelector('[data-ui="test.sort"]');
  const buttons = Array.from(container?.querySelectorAll('button') ?? []);
  const refreshButton = buttons.find((button) =>
    button.textContent?.includes('gallery.app.refresh')
  );
  const listModeButton = container?.querySelector(
    '[data-ui="gallery.header.view-mode.gallery.app.viewModeList"]'
  );

  if (!input || !sortButton || !refreshButton || !listModeButton) {
    throw new Error('Expected gallery header controls');
  }

  expect(container?.querySelector('header')?.className).toContain(
    INSPECTOR_SHELL_FIXED_HEADER_CLASS_NAME
  );
  expect(segment?.className).toContain(INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS);

  act(() => {
    updateInputValue(input, 'updated search');
    sortButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    refreshButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    listModeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(productSelectPropsMock).toHaveBeenCalledWith(expect.objectContaining({ value: 'newest' }));
  expect(props.onSearchChange).toHaveBeenCalled();
  expect(props.onSortModeChange).toHaveBeenCalledWith('size');
  expect(props.onViewModeChange).toHaveBeenCalledWith('list');
  expect(props.onRefresh).toHaveBeenCalledTimes(1);
  expect(container?.textContent).toContain('gallery.app.title');
  expect(container?.textContent).toContain('gallery.app.description');
});

it('uses a scenario-specific label for the third sort option', () => {
  renderHeader({ folderFilter: 'scenario' });

  expect(productSelectPropsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      options: expect.arrayContaining([expect.objectContaining({ label: 'gallery.app.sortName' })]),
    })
  );
});

it('renders banner actions only when warning copy exists', () => {
  const withBanner = {
    banner: 'Storage warning',
    onBannerDismiss: vi.fn(),
    onStorageManagerOpen: vi.fn(),
  };

  act(() => {
    root?.render(<GalleryHeaderBanner {...withBanner} />);
  });

  const buttons = Array.from(container?.querySelectorAll('button') ?? []);
  const storageButton = buttons.find((button) =>
    button.textContent?.includes('gallery.app.storageManager')
  );
  const closeButton = buttons.find((button) =>
    button.textContent?.includes('common.actions.close')
  );

  if (!storageButton || !closeButton) {
    throw new Error('Expected banner actions');
  }

  act(() => {
    storageButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(withBanner.onStorageManagerOpen).toHaveBeenCalledTimes(1);
  expect(withBanner.onBannerDismiss).toHaveBeenCalledTimes(1);

  act(() => {
    root?.render(
      <GalleryHeaderBanner banner={null} onBannerDismiss={vi.fn()} onStorageManagerOpen={vi.fn()} />
    );
  });
  expect(container?.textContent).not.toContain('gallery.app.storageManager');
});
