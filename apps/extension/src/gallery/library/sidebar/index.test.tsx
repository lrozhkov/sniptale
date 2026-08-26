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
    counts: { all: 2, export: 0, recording: 0, scenario: 1, screenshot: 2 },
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
    folderFilter: 'all',
    scope: 'all',
    onActiveTagsChange: vi.fn(),
    onFacetFilterChange: vi.fn(),
    onFolderFilterChange: vi.fn(),
    onResetFilters: vi.fn(),
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
  expect(sectionMocks.folderList).toHaveBeenCalledWith(expect.objectContaining(props));
  expect(sectionMocks.facetFilters).toHaveBeenCalledWith(expect.objectContaining(props));
});
