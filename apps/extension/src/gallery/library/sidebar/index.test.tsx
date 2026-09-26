import { translate } from '../../../platform/i18n';
// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS } from '@sniptale/ui/inspector-shell';
import type { GallerySidebarProps } from './types';

const sectionMocks = vi.hoisted(() => ({
  facetFilters: vi.fn(),
  folderList: vi.fn(),
}));

vi.mock('./sections', () => ({
  GalleryFolderList: (props: unknown) => {
    sectionMocks.folderList(props);
    return <div data-ui="test.folder-list" />;
  },
  GalleryFacetFilters: (props: unknown) => {
    sectionMocks.facetFilters(props);
    return <div data-ui="test.facet-filters" />;
  },
}));

import { GallerySidebar } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps(): GallerySidebarProps {
  return {
    activeTags: ['alpha'],
    allTags: ['alpha', 'beta'],
    counts: { all: 2, audio: 0, export: 0, recording: 0, scenario: 1, screenshot: 2 },
    facetFilters: {
      created: [],
      duration: [],
      format: [],
      resolution: [],
      size: [],
      source: [],
      updated: [],
    },
    facets: [],
    filteredItemCount: 2,
    folderFilter: 'all',
    scope: 'all',
    onActiveTagsChange: vi.fn(),
    onFacetFilterChange: vi.fn(),
    onFolderFilterChange: vi.fn(),
    onResetFilters: vi.fn(),
    onSelectAll: vi.fn(),
    onScopeChange: vi.fn(),
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

it('composes folder and tag sections inside the shared shell', () => {
  const props = createProps();

  act(() => {
    root?.render(<GallerySidebar {...props} />);
  });

  expect(container?.querySelector('aside')?.className).toContain(
    INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS
  );
  expect(container?.querySelector('[data-ui="gallery.sidebar.panel"]')?.className).toContain(
    'rounded-[var(--sniptale-radius-lg)]'
  );
  expect(container?.querySelector('[data-ui="gallery.sidebar.shell"]')?.className).toContain(
    'overflow-hidden'
  );
  expect(container?.querySelector('[data-ui="gallery.sidebar.panel"]')?.className).toContain(
    'overflow-y-auto'
  );
  expect(container?.querySelector('[data-ui="gallery.sidebar.panel"]')?.className).toContain(
    'overscroll-contain'
  );
  expect(container?.querySelector('[data-ui="gallery.sidebar.panel"]')?.className).toContain(
    '[overflow-anchor:none]'
  );
  expect(sectionMocks.folderList).toHaveBeenCalledWith(expect.objectContaining(props));
  expect(sectionMocks.facetFilters).toHaveBeenCalledWith(expect.objectContaining(props));
});

it('offers trash navigation and replaces library filters with recoverable actions', () => {
  const props = {
    ...createProps(),
    onTrashModeChange: vi.fn(),
    onRestoreTrash: vi.fn(),
    onDeleteTrash: vi.fn(),
    onEmptyTrash: vi.fn(),
    selectedCount: 1,
  };
  const button = (key: Parameters<typeof translate>[0]) =>
    Array.from(container!.querySelectorAll('button')).find((element) =>
      element.textContent?.includes(translate(key))
    )!;
  act(() => root?.render(<GallerySidebar {...props} />));
  expect(button('gallery.app.trashTitle').querySelector('svg.lucide-trash2')).not.toBeNull();
  act(() => button('gallery.app.trashTitle').click());
  expect(props.onTrashModeChange).toHaveBeenCalledWith(true);
  act(() => root?.render(<GallerySidebar {...props} trashMode />));
  expect(container?.querySelector('[data-ui="test.folder-list"]')).toBeNull();
  expect(container?.querySelector('[data-ui="test.facet-filters"]')).toBeNull();
  act(() => button('gallery.app.restoreTrash').click());
  act(() => button('gallery.app.permanentDelete').click());
  act(() => button('gallery.app.emptyTrash').click());
  act(() => button('gallery.app.returnToLibrary').click());
  expect(props.onRestoreTrash).toHaveBeenCalledOnce();
  expect(props.onDeleteTrash).toHaveBeenCalledOnce();
  expect(props.onEmptyTrash).toHaveBeenCalledOnce();
  expect(props.onTrashModeChange).toHaveBeenLastCalledWith(false);
  act(() => root?.render(<GallerySidebar {...props} trashMode busy />));
  expect(
    Array.from(container!.querySelectorAll('button')).every((element) => element.disabled)
  ).toBe(true);
});
