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
  collapseGalleryRecordingGroups: vi.fn((items: unknown[]) => items),
  getActiveStorageBarClass: selectorMocks.getActiveStorageBarClass,
  getAllGalleryTags: selectorMocks.getAllGalleryTags,
  getFilteredScenarioProjects: vi.fn(() => []),
  getFilteredGalleryItems: selectorMocks.getFilteredGalleryItems,
  getGalleryCounts: selectorMocks.getGalleryCounts,
  getGalleryFacets: vi.fn(() => []),
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
        createSavedView: vi.fn(),
        deleteSavedView: vi.fn(),
        moveSavedView: vi.fn(),
        reloadSavedViews: vi.fn(),
        resetFilters: vi.fn(),
        selectSavedView: vi.fn(),
        setActiveTags: vi.fn(),
        setFolderFilter: vi.fn(),
        setFacetFilter: vi.fn(),
        setSearch: vi.fn(),
        setScope: vi.fn(),
        setTrashMode: vi.fn(),
        setSelectedIds: vi.fn(),
        setSelectionTagDraft: vi.fn(),
        setSortMode: vi.fn(),
        updateSavedView: vi.fn(),
      },
      state: {
        activeSavedView: null,
        activeTags: ['alpha'],
        facetFilters: {
          created: [],
          duration: [],
          format: [],
          resolution: [],
          size: [],
          source: [],
          updated: [],
        },
        folderFilter: 'all',
        isSavedViewDirty: false,
        savedViews: [],
        savedViewsLoadFailed: false,
        savedViewsLoaded: true,
        search: 'capture',
        scope: 'library',
        trashMode: false,
        selectedIds: new Set(['asset-1']),
        selectionTagDraft: '',
        sortMode: 'newest',
      },
    },
    library: {
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
      importTriggerRef: { current: null },
      mediaImportInputRef: { current: null },
      mediaImportTriggerRef: { current: null },
      webSnapshotImport: {
        inputRef: { current: null },
        triggerRef: { current: null },
      },
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
    audio: 0,
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

it('partitions trash before normal facets, counts, selection and search; trash ignores library filters', () => {
  const props = createProbeProps('healthy');
  const trashed = {
    ...item,
    id: 'trashed',
    tags: ['trash-only'],
    lifecycle: { storageClass: 'library' as const, savedAt: 1, updatedAt: 1, trashedAt: 2 },
  };
  props.library.items = [item, trashed];
  props.filters.state.selectedIds = new Set(['asset-1', 'trashed']);
  act(() => root?.render(<HookProbe {...props} />));
  expect(latestValue?.allItems).toEqual([item]);
  expect(latestValue?.selectedItems).toEqual([item]);
  expect(selectorMocks.getAllGalleryTags).toHaveBeenLastCalledWith([item]);
  expect(selectorMocks.getFilteredGalleryItems).toHaveBeenLastCalledWith(
    expect.objectContaining({ items: [item] })
  );
  props.filters.state.trashMode = true;
  act(() => root?.render(<HookProbe {...props} />));
  expect(latestValue?.allItems).toEqual([trashed]);
  expect(latestValue?.selectedItems).toEqual([trashed]);
  expect(selectorMocks.getFilteredGalleryItems).toHaveBeenLastCalledWith(
    expect.objectContaining({
      items: [trashed],
      search: '',
      scope: 'all',
      folderFilter: 'all',
      activeTags: [],
    })
  );
});
