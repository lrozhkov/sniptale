// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const selectorMocks = vi.hoisted(() => ({
  getActiveStorageBarClass: vi.fn(),
  getAllGalleryTags: vi.fn(),
  getFilteredGalleryItems: vi.fn(),
  getGalleryCounts: vi.fn(),
  getGalleryGridMetrics: vi.fn(),
}));

vi.mock('./selectors', () => ({
  getActiveStorageBarClass: selectorMocks.getActiveStorageBarClass,
  getAllGalleryTags: selectorMocks.getAllGalleryTags,
  getFilteredScenarioProjects: vi.fn(() => []),
  getFilteredGalleryItems: selectorMocks.getFilteredGalleryItems,
  getGalleryCounts: selectorMocks.getGalleryCounts,
  getGalleryGridMetrics: selectorMocks.getGalleryGridMetrics,
}));

import { useGalleryDerivedState } from './derived';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestValue: ReturnType<typeof useGalleryDerivedState> | null = null;

const item = {
  id: 'asset-1',
  kind: 'screenshot' as const,
  filename: 'capture.png',
  originalFilename: 'capture.png',
  mimeType: 'image/png',
  size: 256,
  createdAt: 1,
  updatedAt: 1,
  width: 100,
  height: 100,
  duration: null,
  source: { kind: 'screenshot' as const },
  sourceUrl: null,
  sourceTitle: null,
  sourceFavicon: null,
  tags: ['alpha'],
  hasThumbnail: false,
};

function HookProbe(props: Parameters<typeof useGalleryDerivedState>[0]) {
  latestValue = useGalleryDerivedState(props);
  return null;
}

function createProbeProps(
  storagePressure: 'healthy' | 'warning' | undefined
): Parameters<typeof useGalleryDerivedState>[0] {
  return {
    filters: {
      actions: {
        setActiveTags: vi.fn(),
        setFolderFilter: vi.fn(),
        setSearch: vi.fn(),
        setSelectedIds: vi.fn(),
        setSelectionTagDraft: vi.fn(),
        setSortMode: vi.fn(),
      },
      state: {
        activeTags: ['alpha'],
        folderFilter: 'all',
        search: 'capture',
        selectedIds: new Set(['asset-1']),
        selectionTagDraft: '',
        sortMode: 'newest',
      },
    },
    library: {
      cleanupReport: null,
      isLoading: false,
      items: [item],
      refresh: vi.fn(),
      storageInfo:
        storagePressure === undefined
          ? null
          : {
              pressure: storagePressure,
              quota: 100,
              remaining: 80,
              usage: 20,
              usageRatio: 0.2,
              isPersistent: true,
            },
    },
    viewMode: 'list',
    viewport: {
      gridViewportRef: { current: null },
      gridWidth: 800,
      importInputRef: { current: null },
      scrollTop: 12,
      viewportHeight: 600,
    },
  };
}

function renderProbe(storagePressure: 'healthy' | 'warning' | undefined) {
  act(() => {
    root?.render(<HookProbe {...createProbeProps(storagePressure)} />);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  latestValue = null;
  selectorMocks.getActiveStorageBarClass.mockReturnValue('storage-normal');
  selectorMocks.getAllGalleryTags.mockReturnValue(['alpha']);
  selectorMocks.getFilteredGalleryItems.mockReturnValue([item]);
  selectorMocks.getGalleryCounts.mockReturnValue({
    all: 1,
    export: 0,
    recording: 0,
    scenario: 0,
    screenshot: 1,
  });
  selectorMocks.getGalleryGridMetrics.mockReturnValue({
    columnCount: 1,
    startRow: 0,
    totalRows: 1,
    visibleItems: [item],
  });
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

it('derives gallery state with healthy storage pressure normalized to normal', () => {
  renderProbe('healthy');

  expect(selectorMocks.getActiveStorageBarClass).toHaveBeenCalledWith('normal');
  expect(selectorMocks.getGalleryGridMetrics).toHaveBeenCalledWith(
    expect.objectContaining({ viewMode: 'list' })
  );
  expect(latestValue?.selectedItems).toEqual([item]);
  expect(latestValue?.selectedSize).toBe(256);
});

it('passes non-healthy storage pressure through unchanged and handles missing storage info', () => {
  renderProbe('warning');
  expect(selectorMocks.getActiveStorageBarClass).toHaveBeenCalledWith('warning');

  renderProbe(undefined);
  expect(selectorMocks.getActiveStorageBarClass).toHaveBeenLastCalledWith(undefined);
});
