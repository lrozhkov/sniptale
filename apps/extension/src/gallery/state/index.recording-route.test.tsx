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
  collapseGalleryRecordingGroups: vi.fn((items: unknown[]) => items),
  getActiveStorageBarClass: getActiveStorageBarClassMock,
  getAllGalleryTags: getAllGalleryTagsMock,
  getFilteredGalleryItems: getFilteredGalleryItemsMock,
  getFilteredScenarioProjects: vi.fn(() => []),
  getGalleryCounts: getGalleryCountsMock,
  getGalleryFacets: vi.fn(() => []),
  getGalleryGridMetrics: getGalleryGridMetricsMock,
}));
vi.mock('./useGalleryFilterState', () => ({ useGalleryFilterState: useGalleryFilterStateMock }));
vi.mock('../library/preview/useGalleryPreviewState', () => ({
  useGalleryPreviewState: useGalleryPreviewStateMock,
}));
vi.mock('./storage-workflow', () => ({ useGalleryStorageWorkflow: useGalleryStorageWorkflowMock }));
vi.mock('./useGalleryViewportState', () => ({
  useGalleryViewportState: useGalleryViewportStateMock,
}));

import { useGalleryAppState } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const galleryActionMocks = {
  setFolderFilter: vi.fn(),
  setPreview: vi.fn(),
};

function HookProbe() {
  useGalleryAppState('compact-grid');
  return null;
}

function renderHook() {
  act(() => {
    root?.render(<HookProbe />);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.history.pushState({}, '', '/gallery.html?recordingId=rec-7');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  configureSelectorMocks({
    getActiveStorageBarClassMock,
    getAllGalleryTagsMock,
    getFilteredGalleryItemsMock,
    getGalleryCountsMock,
    getGalleryGridMetricsMock,
  });
  configureGalleryOwnerMocks();
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

it('opens the requested recording preview from the recordingId route parameter', () => {
  const recordingItem = createItem({
    id: 'recording:rec-7',
    kind: 'video',
    source: { kind: 'recording', recordingId: 'rec-7' },
  });
  configureGalleryOwnerMocks('library', [recordingItem, createItem({ id: 'other' })]);

  renderHook();

  expect(galleryActionMocks.setFolderFilter).not.toHaveBeenCalled();
  expect(galleryActionMocks.setPreview).toHaveBeenCalledWith({
    inspectorCollapsed: false,
    item: recordingItem,
    url: null,
  });
  expect(window.location.search).toBe('');
});

it('opens a requested draft from the complete catalog without retaining route filters', () => {
  window.history.replaceState(
    null,
    '',
    '/gallery.html?folder=recording&recordingId=rec-draft&scope=temporary'
  );
  const recordingItem = createItem({
    id: 'recording:rec-draft',
    kind: 'video',
    lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 1 },
    source: { kind: 'recording', recordingId: 'rec-draft' },
  });
  configureGalleryOwnerMocks('library', [createItem({ id: 'saved' }), recordingItem]);

  renderHook();

  expect(galleryActionMocks.setFolderFilter).not.toHaveBeenCalled();
  expect(galleryActionMocks.setPreview).toHaveBeenCalledWith({
    inspectorCollapsed: false,
    item: recordingItem,
    url: null,
  });
  expect(window.location.search).toBe('');
});

function configureGalleryOwnerMocks(
  scope: 'library' | 'temporary' = 'library',
  items = [createItem()]
): void {
  useGalleryFilterStateMock.mockReturnValue({
    actions: { setFolderFilter: galleryActionMocks.setFolderFilter },
    state: {
      activeTags: [],
      folderFilter: scope === 'temporary' ? 'recording' : 'all',
      search: '',
      scope,
      selectedIds: new Set(),
      selectionTagDraft: '',
      sortMode: 'newest',
    },
  });
  useGalleryPreviewStateMock.mockReturnValue({
    actions: { setPreview: galleryActionMocks.setPreview },
    state: {
      draft: {
        filename: 'preview.mp4',
        hasChanges: false,
        initialFilename: 'preview.mp4',
        initialTagDrafts: [],
        tagInput: '',
        tags: [],
      },
      session: null,
    },
  });
  useGalleryStorageWorkflowMock.mockReturnValue({
    actions: {},
    library: { items, refresh: vi.fn() },
    state: { isBusy: false, isLoading: false },
  });
  useGalleryViewportStateMock.mockReturnValue({
    gridViewportRef: { current: null },
    gridWidth: 1024,
    importInputRef: { current: null },
    importTriggerRef: { current: null },
    mediaImportInputRef: { current: null },
    mediaImportTriggerRef: { current: null },
    scrollTop: 0,
    setGridWidth: vi.fn(),
    setScrollTop: vi.fn(),
    setViewportHeight: vi.fn(),
    viewportHeight: 768,
    webSnapshotImport: {
      inputRef: { current: null },
      triggerRef: { current: null },
    },
  });
}
