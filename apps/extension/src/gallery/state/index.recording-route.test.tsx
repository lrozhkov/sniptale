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
  getFilteredGalleryItems: getFilteredGalleryItemsMock,
  getFilteredScenarioProjects: vi.fn(() => []),
  getGalleryCounts: getGalleryCountsMock,
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
  getFilteredGalleryItemsMock.mockReturnValue([recordingItem]);

  renderHook();

  expect(galleryActionMocks.setFolderFilter).toHaveBeenCalledWith('recording');
  expect(galleryActionMocks.setPreview).toHaveBeenCalledWith({
    inspectorCollapsed: false,
    item: recordingItem,
    url: null,
  });
});

it('opens the requested draft recording after filtering the temporary scope', () => {
  window.history.replaceState(
    null,
    '',
    '/gallery.html?folder=recording&recordingId=rec-draft&scope=temporary'
  );
  configureGalleryOwnerMocks('temporary');
  const recordingItem = createItem({
    id: 'recording:rec-draft',
    kind: 'video',
    lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 1 },
    source: { kind: 'recording', recordingId: 'rec-draft' },
  });
  getFilteredGalleryItemsMock.mockReturnValue([recordingItem]);

  renderHook();

  expect(getFilteredGalleryItemsMock).toHaveBeenCalledWith(
    expect.objectContaining({ scope: 'temporary' })
  );
  expect(galleryActionMocks.setPreview).toHaveBeenCalledWith({
    inspectorCollapsed: false,
    item: recordingItem,
    url: null,
  });
});

function configureGalleryOwnerMocks(scope: 'library' | 'temporary' = 'library'): void {
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
    library: { items: [createItem()], refresh: vi.fn() },
    state: { isBusy: false, isLoading: false },
  });
  useGalleryViewportStateMock.mockReturnValue({
    gridViewportRef: { current: null },
    gridWidth: 1024,
    importInputRef: { current: null },
    scrollTop: 0,
    setGridWidth: vi.fn(),
    setScrollTop: vi.fn(),
    setViewportHeight: vi.fn(),
    viewportHeight: 768,
  });
}
