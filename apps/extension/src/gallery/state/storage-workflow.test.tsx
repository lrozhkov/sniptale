// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createItem } from './index.test-support';
import type { GalleryPreviewSessionState } from './types';

const { getAggregatePreviewBlobMock, useGalleryLibraryStateMock, useGallerySurfaceStateMock } =
  vi.hoisted(() => ({
    getAggregatePreviewBlobMock: vi.fn(),
    useGalleryLibraryStateMock: vi.fn(),
    useGallerySurfaceStateMock: vi.fn(),
  }));

vi.mock('../../composition/persistence/aggregate-presentations', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../composition/persistence/aggregate-presentations')
  >()),
  getAggregatePreviewBlob: getAggregatePreviewBlobMock,
}));

vi.mock('./useGalleryLibraryState', () => ({
  useGalleryLibraryState: useGalleryLibraryStateMock,
}));

vi.mock('./useGallerySurfaceState', () => ({
  useGallerySurfaceState: useGallerySurfaceStateMock,
}));

import { useGalleryStorageWorkflow } from './storage-workflow';
import { useGalleryPreviewState } from '../library/preview/useGalleryPreviewState';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestWorkflow: ReturnType<typeof useGalleryStorageWorkflow> | null = null;
let currentPreview: GalleryPreviewSessionState = {
  inspectorCollapsed: false,
  item: null,
  url: 'blob:preview',
};
let currentSelectedIds = new Set<string>(['asset-1', 'asset-2']);
let libraryCallbacks: {
  onBanner: (message: string) => void;
  onPreviewItemRefresh: (items: ReturnType<typeof createItem>[]) => void;
  onSelectionRefresh: (items: ReturnType<typeof createItem>[]) => void;
} | null = null;

function HookProbe() {
  latestWorkflow = useGalleryStorageWorkflow({
    setPreview: (
      next:
        | GalleryPreviewSessionState
        | ((previous: GalleryPreviewSessionState) => GalleryPreviewSessionState)
    ) => {
      currentPreview = typeof next === 'function' ? next(currentPreview) : next;
    },
    setSelectedIds: (next: Set<string> | ((previous: Set<string>) => Set<string>)) => {
      currentSelectedIds = typeof next === 'function' ? next(currentSelectedIds) : next;
    },
  });
  return null;
}

let latestIntegratedPreview: ReturnType<typeof useGalleryPreviewState> | null = null;

function IntegratedHookProbe() {
  const preview = useGalleryPreviewState();
  latestIntegratedPreview = preview;
  useGalleryStorageWorkflow({
    setPreview: preview.actions.setPreview,
    setSelectedIds: () => undefined,
  });
  return null;
}

function renderHook() {
  act(() => {
    root?.render(<HookProbe />);
  });

  if (!latestWorkflow) {
    throw new Error('Expected gallery storage workflow');
  }

  return latestWorkflow;
}

function configureSurfaceStateMock() {
  useGallerySurfaceStateMock.mockReturnValue({
    actions: {
      beginBlockingOperation: vi.fn(() => () => undefined),
      cancelActiveBackupExport: vi.fn(),
      releaseActiveBackupExport: vi.fn(),
      replaceActiveBackupExport: vi.fn(),
      setBanner: vi.fn(),
      setConfirmDialog: vi.fn(),
      setDeletionRequest: vi.fn(),
      setPendingExport: vi.fn(),
      setPendingImport: vi.fn(),
      setPendingMediaImport: vi.fn(),
    },
    state: {
      banner: { kind: 'info' },
      confirmDialog: null,
      deletionRequest: null,
      isBusy: false,
      pendingExport: null,
      pendingImport: null,
      pendingMediaImport: null,
    },
  });
}

function configureLibraryStateMock() {
  useGalleryLibraryStateMock.mockImplementation((callbacks) => {
    libraryCallbacks = callbacks;
    return {
      hasLoadedLibrarySnapshot: true,
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
    };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  latestWorkflow = null;
  libraryCallbacks = null;
  currentPreview = {
    inspectorCollapsed: false,
    item: createItem(),
    url: 'blob:preview',
  };
  currentSelectedIds = new Set(['asset-1', 'asset-2']);
  configureSurfaceStateMock();
  configureLibraryStateMock();
  getAggregatePreviewBlobMock.mockResolvedValue(new Blob(['preview'], { type: 'image/png' }));
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:preview'),
    revokeObjectURL: vi.fn(),
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

it('exposes storage workflow state and actions from the owner seam', () => {
  const workflow = renderHook();

  expect(workflow.state.storageInfo?.usage).toBe(150);
  expect(workflow.state.hasLoadedLibrarySnapshot).toBe(true);
  expect(workflow.state.banner).toEqual({ kind: 'info' });
  expect(workflow.actions.refresh).toBeTypeOf('function');
  expect(workflow.actions.setBanner).toBe(
    useGallerySurfaceStateMock.mock.results[0]?.value.actions.setBanner
  );
});

it('wires storage callbacks for preview refresh and selection pruning', () => {
  renderHook();

  libraryCallbacks?.onPreviewItemRefresh([createItem({ id: 'asset-9' })]);
  expect(currentPreview.item).toBeNull();

  currentPreview = {
    inspectorCollapsed: false,
    item: createItem({ id: 'asset-2' }),
    url: 'blob:preview',
  };
  libraryCallbacks?.onPreviewItemRefresh([createItem({ id: 'asset-2', filename: 'fresh.png' })]);
  expect(currentPreview.item?.filename).toBe('fresh.png');

  libraryCallbacks?.onSelectionRefresh([createItem({ id: 'asset-2' })]);
  expect(Array.from(currentSelectedIds)).toEqual(['asset-2']);
});

it('retains a Trash preview only while its item remains trashed and never revives a closed preview', () => {
  renderHook();
  currentPreview = {
    inspectorCollapsed: true,
    item: createItem({ id: 'asset-1', lifecycle: { trashedAt: 42 } }),
    url: 'blob:old-preview',
  };

  libraryCallbacks?.onPreviewItemRefresh([
    createItem({ id: 'asset-1', filename: 'refreshed.png', lifecycle: { trashedAt: 42 } }),
  ]);
  expect(currentPreview.item?.filename).toBe('refreshed.png');
  expect(currentPreview.url).toBeNull();

  libraryCallbacks?.onPreviewItemRefresh([createItem({ id: 'asset-1' })]);
  expect(currentPreview.item).toBeNull();

  libraryCallbacks?.onPreviewItemRefresh([
    createItem({ id: 'asset-1', lifecycle: { trashedAt: 42 } }),
  ]);
  expect(currentPreview.item).toBeNull();
});

it('keeps edits made during save when a library refresh reconciles the selected item', async () => {
  await act(async () => {
    root?.render(<IntegratedHookProbe />);
  });
  act(() =>
    latestIntegratedPreview?.actions.setPreview({
      inspectorCollapsed: false,
      item: createItem(),
      url: null,
    })
  );
  await act(async () => Promise.resolve());

  act(() => {
    latestIntegratedPreview?.actions.setFilenameDraft('newer local edit.png');
    latestIntegratedPreview?.actions.setTagDrafts(['newer']);
  });
  act(() =>
    libraryCallbacks?.onPreviewItemRefresh([createItem({ filename: 'saved.png', tags: ['saved'] })])
  );
  await act(async () => Promise.resolve());

  expect(latestIntegratedPreview?.state.draft).toMatchObject({
    filename: 'newer local edit.png',
    initialFilename: 'saved.png',
    tags: ['newer'],
    initialTagDrafts: ['saved'],
    hasChanges: true,
  });
});
