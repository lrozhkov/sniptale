// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createItem } from './index.test-support';
import type { GalleryPreviewSessionState } from './types';

const { useGalleryLibraryStateMock, useGallerySurfaceStateMock } = vi.hoisted(() => ({
  useGalleryLibraryStateMock: vi.fn(),
  useGallerySurfaceStateMock: vi.fn(),
}));

vi.mock('./useGalleryLibraryState', () => ({
  useGalleryLibraryState: useGalleryLibraryStateMock,
}));

vi.mock('./useGallerySurfaceState', () => ({
  useGallerySurfaceState: useGallerySurfaceStateMock,
}));

import { useGalleryStorageWorkflow } from './storage-workflow';

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
  onStorageManagerOpen: () => void;
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
      setBanner: vi.fn(),
      setConfirmDialog: vi.fn(),
      setIsBusy: vi.fn(),
      setPendingExport: vi.fn(),
      setPendingImport: vi.fn(),
      setShowStorageManager: vi.fn(),
    },
    state: {
      banner: { kind: 'info' },
      confirmDialog: null,
      isBusy: false,
      pendingExport: null,
      pendingImport: null,
      showStorageManager: false,
    },
  });
}

function configureLibraryStateMock() {
  useGalleryLibraryStateMock.mockImplementation((callbacks) => {
    libraryCallbacks = callbacks;
    return {
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
  expect(workflow.state.cleanupReport).toEqual({ removed: 0 });
  expect(workflow.state.banner).toEqual({ kind: 'info' });
  expect(workflow.actions.refresh).toBeTypeOf('function');
  expect(workflow.actions.setBanner).toBe(
    useGallerySurfaceStateMock.mock.results[0]?.value.actions.setBanner
  );
});

it('wires storage callbacks for preview refresh, selection pruning, and storage manager open', () => {
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

  const surfaceState = useGallerySurfaceStateMock.mock.results[0]?.value;
  libraryCallbacks?.onStorageManagerOpen();
  expect(surfaceState.actions.setShowStorageManager).toHaveBeenCalledWith(true);
});
