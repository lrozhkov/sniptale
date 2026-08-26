// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMediaItem } from '../actions/test-support/index';

const { bannerPropsMock, gridPropsMock } = vi.hoisted(() => ({
  bannerPropsMock: vi.fn(),
  gridPropsMock: vi.fn(),
}));

vi.mock('./header', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./header')>()),
  GalleryHeaderBanner: (props: unknown) => {
    bannerPropsMock(props);
    return <div data-ui="test.banner" />;
  },
}));

vi.mock('./grid', () => ({
  GalleryGrid: (props: unknown) => {
    gridPropsMock(props);
    return <div data-ui="test.grid" />;
  },
}));

import { GalleryMainContent } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps(overrides: Partial<Parameters<typeof GalleryMainContent>[0]> = {}) {
  return {
    banner: 'warning',
    children: <div data-ui="test.children">child</div>,
    filteredItems: [createMediaItem()],
    filteredScenarioProjects: [],
    folderFilter: 'all' as const,
    gridMetrics: { columnCount: 1, startRow: 0, totalRows: 1 },
    gridWidth: 960,
    gridViewportRef: { current: null },
    isLoading: false,
    search: '',
    scope: 'all' as const,
    selectedIds: new Set<string>(),
    selectedItems: [createMediaItem()],
    selectedSize: 256,
    selectionTagDraft: '',
    sortMode: 'newest' as const,
    visibleItems: [createMediaItem()],
    viewMode: 'compact-grid' as const,
    onApplySelectionTag: vi.fn(),
    onBannerDismiss: vi.fn(),
    onClearSelection: vi.fn(),
    onDeleteMany: vi.fn(),
    onPreviewOpen: vi.fn(),
    onScenarioPreviewOpen: vi.fn(),
    onSearchChange: vi.fn(),
    onScopeChange: vi.fn(),
    onSelectionTagDraftChange: vi.fn(),
    onSelectionBackup: vi.fn(),
    onSelectionZip: vi.fn(),
    onSortModeChange: vi.fn(),
    onToggleSelection: vi.fn(),
    onViewModeChange: vi.fn(),
    ...overrides,
  };
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

it('composes the banner, children, and grid inside the main content shell', () => {
  const props = createProps();

  act(() => {
    root?.render(<GalleryMainContent {...props} />);
  });

  expect(bannerPropsMock).toHaveBeenCalledWith(expect.objectContaining({ banner: 'warning' }));
  expect(gridPropsMock).toHaveBeenCalledWith(
    expect.objectContaining({ visibleItems: props.visibleItems })
  );
  expect(container?.querySelector('[data-ui="test.children"]')?.textContent).toBe('child');
});

it('keeps the grid active for the scenario folder', () => {
  const props = createProps({ folderFilter: 'scenario' });

  act(() => {
    root?.render(<GalleryMainContent {...props} />);
  });

  expect(gridPropsMock).toHaveBeenCalledWith(expect.objectContaining({ folderFilter: 'scenario' }));
});

it('skips the banner row when no warning copy is present', () => {
  const props = createProps({ banner: null });

  act(() => {
    root?.render(<GalleryMainContent {...props} />);
  });

  expect(container?.querySelector('[data-ui="test.banner"]')).toBeNull();
  expect(bannerPropsMock).not.toHaveBeenCalled();
});
