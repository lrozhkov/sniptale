// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { configureSelectorMocks, createItem } from './index.test-support';

const {
  getActiveStorageBarClassMock,
  getAllGalleryTagsMock,
  getFilteredGalleryItemsMock,
  getGalleryCountsMock,
  getGalleryGridMetricsMock,
  useGalleryFilterStateMock,
  useGalleryPreviewStateMock,
  useGalleryStorageWorkflowMock,
  useGalleryViewportStateMock,
} = vi.hoisted(() => ({
  getActiveStorageBarClassMock: vi.fn(),
  getAllGalleryTagsMock: vi.fn(),
  getFilteredGalleryItemsMock: vi.fn(),
  getGalleryCountsMock: vi.fn(),
  getGalleryGridMetricsMock: vi.fn(),
  useGalleryFilterStateMock: vi.fn(),
  useGalleryPreviewStateMock: vi.fn(),
  useGalleryStorageWorkflowMock: vi.fn(),
  useGalleryViewportStateMock: vi.fn(),
}));

vi.mock('./selectors', () => ({
  getActiveStorageBarClass: getActiveStorageBarClassMock,
  getAllGalleryTags: getAllGalleryTagsMock,
  getFilteredScenarioProjects: vi.fn(() => []),
  getFilteredGalleryItems: getFilteredGalleryItemsMock,
  getGalleryCounts: getGalleryCountsMock,
  getGalleryGridMetrics: getGalleryGridMetricsMock,
}));
vi.mock('./useGalleryFilterState', () => ({
  useGalleryFilterState: useGalleryFilterStateMock,
}));
vi.mock('../library/preview/useGalleryPreviewState', () => ({
  useGalleryPreviewState: useGalleryPreviewStateMock,
}));
vi.mock('./storage-workflow', () => ({
  useGalleryStorageWorkflow: useGalleryStorageWorkflowMock,
}));
vi.mock('./useGalleryViewportState', () => ({
  useGalleryViewportState: useGalleryViewportStateMock,
}));

import { useGalleryAppState } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestController: ReturnType<typeof useGalleryAppState> | null = null;
let currentSelectedIds = new Set<string>(['asset-1', 'asset-2']);
const galleryActionMocks = {
  setFolderFilter: vi.fn(),
  setPreview: vi.fn(),
};

function HookProbe() {
  latestController = useGalleryAppState('compact-grid');
  return null;
}

function renderHook() {
  act(() => {
    root?.render(<HookProbe />);
  });

  if (!latestController) {
    throw new Error('Expected gallery app controller');
  }

  return latestController;
}

function createSelectedIdsSetter() {
  return (next: Set<string> | ((previous: Set<string>) => Set<string>)) => {
    currentSelectedIds = typeof next === 'function' ? next(currentSelectedIds) : next;
  };
}

function configureFilterHookMock() {
  useGalleryFilterStateMock.mockImplementation(() => ({
    actions: {
      setActiveTags: vi.fn(),
      setFolderFilter: galleryActionMocks.setFolderFilter,
      setSearch: vi.fn(),
      setSelectedIds: createSelectedIdsSetter(),
      setSelectionTagDraft: vi.fn(),
      setSortMode: vi.fn(),
    },
    state: {
      activeTags: ['alpha'],
      folderFilter: 'all',
      search: 'needle',
      selectedIds: currentSelectedIds,
      selectionTagDraft: 'batch-tag',
      sortMode: 'newest',
    },
  }));
}

function configurePreviewHookMock() {
  useGalleryPreviewStateMock.mockImplementation(() => ({
    actions: {
      setFilenameDraft: vi.fn(),
      setPreview: galleryActionMocks.setPreview,
      setTagDraft: vi.fn(),
      setTagDrafts: vi.fn(),
    },
    state: {
      draft: {
        filename: 'preview.png',
        hasChanges: false,
        initialFilename: 'preview.png',
        initialTagDrafts: ['alpha'],
        tagInput: 'draft',
        tags: ['alpha'],
      },
      session: {
        inspectorCollapsed: false,
        item: createItem(),
        url: 'blob:preview',
      },
    },
  }));
}

function configureStorageWorkflowMock() {
  useGalleryStorageWorkflowMock.mockReturnValue({
    actions: {
      refresh: vi.fn(),
      setBanner: vi.fn(),
      setConfirmDialog: vi.fn(),
      setIsBusy: vi.fn(),
      setPendingExport: vi.fn(),
      setPendingImport: vi.fn(),
      setShowStorageManager: vi.fn(),
    },
    library: {
      cleanupReport: { removed: 0 },
      isLoading: false,
      items: [createItem(), createItem({ id: 'asset-2', size: 50, tags: [] })],
      refresh: vi.fn(),
      storageInfo: {
        isPersistent: true,
        pressure: 'healthy',
        quota: 1000,
        remaining: 850,
        usage: 150,
        usageRatio: 0.15,
      },
    },
    state: {
      banner: { kind: 'info' },
      cleanupReport: { removed: 0 },
      confirmDialog: null,
      isBusy: false,
      isLoading: false,
      pendingExport: null,
      pendingImport: null,
      showStorageManager: false,
      storageInfo: {
        isPersistent: true,
        pressure: 'healthy',
        quota: 1000,
        remaining: 850,
        usage: 150,
        usageRatio: 0.15,
      },
    },
  });
}

function configureViewportMock() {
  useGalleryViewportStateMock.mockReturnValue({
    gridViewportRef: { current: null },
    gridWidth: 1024,
    importInputRef: { current: null },
    scrollTop: 24,
    setGridWidth: vi.fn(),
    setScrollTop: vi.fn(),
    setViewportHeight: vi.fn(),
    viewportHeight: 768,
  });
}

function configureOwnerHookMocks() {
  configureFilterHookMock();
  configurePreviewHookMock();
  configureStorageWorkflowMock();
  configureViewportMock();
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.pushState({}, '', '/gallery.html');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  latestController = null;
  currentSelectedIds = new Set(['asset-1', 'asset-2']);
  configureSelectorMocks({
    getActiveStorageBarClassMock,
    getAllGalleryTagsMock,
    getFilteredGalleryItemsMock,
    getGalleryCountsMock,
    getGalleryGridMetricsMock,
  });
  configureOwnerHookMocks();
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

it('builds derived gallery state from owner subhooks and selectors', () => {
  const controller = renderHook();

  expect(getActiveStorageBarClassMock).toHaveBeenCalledWith('normal');
  expect(getGalleryCountsMock).toHaveBeenCalled();
  expect(getAllGalleryTagsMock).toHaveBeenCalled();
  expect(getFilteredGalleryItemsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      activeTags: ['alpha'],
      folderFilter: 'all',
      search: 'needle',
      sortMode: 'newest',
    })
  );
  expect(getGalleryGridMetricsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      gridWidth: 1024,
      scrollTop: 24,
      viewMode: 'compact-grid',
      viewportHeight: 768,
    })
  );
  expect(controller.state.derived.activeStorageBarClass).toBe('storage-normal');
  expect(controller.state.selection.selectedSize).toBe(150);
  expect(controller.state.derived.visibleItems).toHaveLength(1);
});

it('toggles selected ids in both directions through the controller action seam', () => {
  const controller = renderHook();

  expect(Array.from(currentSelectedIds)).toEqual(['asset-1', 'asset-2']);

  act(() => {
    controller.actions.selection.toggleSelection('asset-3');
    controller.actions.selection.toggleSelection('asset-1');
  });

  expect(Array.from(currentSelectedIds)).toEqual(['asset-2', 'asset-3']);
});

it('selects the full filtered range for shift-toggle and skips non-selectable items', () => {
  currentSelectedIds = new Set();
  getFilteredGalleryItemsMock.mockReturnValue([
    createItem({ id: 'asset-1' }),
    createItem({ id: 'scenario:project-1', kind: 'scenario', type: 'scenario' }),
    createItem({
      id: 'scenario-export:export-1',
      kind: 'scenario-export',
      type: 'scenario-export',
    }),
    createItem({ id: 'asset-4' }),
  ]);
  const controller = renderHook();
  act(() => {
    controller.actions.selection.toggleSelection('asset-1');
    controller.actions.selection.toggleSelection('asset-4', { shiftKey: true });
  });
  expect(Array.from(currentSelectedIds)).toEqual(['asset-1', 'scenario:project-1', 'asset-4']);
});
